// servidor/modulo-procesamiento/src/services/userValidator.js

const axios = require('axios');

class UserValidator {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        this.timeout = 5000; // Reducido a 5 segundos para WhatsApp
        
        // Cache en memoria para validaciones
        this.validationCache = new Map();
        this.cacheTimeout = 8 * 60 * 1000; // 8 minutos
        
        // Limpiar cache cada 10 minutos
        setInterval(() => this.cleanExpiredCache(), 10 * 60 * 1000);
    }

    async validateUser(phoneNumber) {
        console.log('🔍 Validando usuario:', phoneNumber);

        try {
            // 1. Limpiar número de teléfono
            const cleanPhone = this.cleanPhoneNumber(phoneNumber);
            
            // 2. CACHE: Verificar cache primero
            const cached = this.getCachedValidation(cleanPhone);
            if (cached) {
                console.log('⚡ Usuario válido desde CACHE:', cached.userData?.nombre || 'Usuario');
                return cached;
            }
            
            // 3. NUEVA LÓGICA: Verificar sesión persistente primero (vía Database Module)
            try {
                const sessionResponse = await axios.post(`${this.databaseUrl}/api/sessions/validate`, {
                    phoneNumber: cleanPhone
                }, {
                    timeout: this.timeout,
                    headers: {
                        'X-Source': 'processing-module'
                    }
                });

                if (sessionResponse.data.success && sessionResponse.data.data.valid) {
                    const sessionData = sessionResponse.data.data;
                    
                    const validationResult = {
                        isValid: true,
                        userData: sessionData.user,
                        timestamp: Date.now(),
                        fromSession: sessionData.fromCache, // true = sesión existente, false = nueva sesión
                        sessionId: sessionData.session?._id
                    };

                    if (sessionData.fromCache) {
                        console.log('✅ Usuario válido desde sesión (Database Module):', sessionData.user.nombre);
                    } else {
                        console.log('✅ Usuario validado y nueva sesión creada (Database Module):', sessionData.user.nombre);
                    }

                    // Cachear resultado para futuras consultas
                    this.setCachedValidation(cleanPhone, validationResult);
                    return validationResult;
                }
            } catch (sessionError) {
                console.warn('⚠️ Error consultando sesión vía Database Module, usando fallback:', sessionError.message);
                // Continuar con el fallback si el Database Module falla
            }

            // 4. FALLBACK: Consulta directa a PostgreSQL (último recurso)
            const response = await axios.get(`${this.databaseUrl}/api/users/validate/${cleanPhone}`, {
                timeout: this.timeout,
                headers: {
                    'X-Source': 'processing-module-fallback'
                }
            });

            const validationResult = {
                isValid: response.data.valid || false,
                userData: response.data.data || null,
                timestamp: Date.now(),
                fromSession: false,
                method: 'fallback-direct'
            };

            if (validationResult.isValid) {
                console.log('✅ Usuario válido (método directo):', validationResult.userData.nombre);
                // Cachear resultado positivo
                this.setCachedValidation(cleanPhone, validationResult);
            } else {
                console.log('❌ Usuario no encontrado en sistema');
                // NO cachear resultados negativos para permitir retry
            }

            return validationResult;

        } catch (error) {
            console.error('❌ Error validando usuario:', error.message);
            
            // En caso de error, asumir usuario no válido
            return {
                isValid: false,
                userData: null,
                error: error.message,
                timestamp: Date.now(),
                method: 'error'
            };
        }
    }

    // Limpiar número de teléfono para consulta consistente
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        
        // Remover @c.us si existe (formato WhatsApp)
        let cleaned = phoneNumber.replace('@c.us', '');
        
        // Remover caracteres no numéricos excepto +
        cleaned = cleaned.replace(/[^\d+]/g, '');
        
        // Normalizar formato boliviano
        if (cleaned.startsWith('591')) {
            // Ya tiene código de país
            return cleaned;
        } else if (cleaned.startsWith('+591')) {
            // Remover + inicial
            return cleaned.substring(1);
        } else if (cleaned.length === 8) {
            // Número local, agregar código de país
            return `591${cleaned}`;
        }
        
        return cleaned;
    }

    // Validar si un usuario tiene permisos específicos
    async validateUserPermissions(phoneNumber, requiredPermissions = []) {
        const validation = await this.validateUser(phoneNumber);
        
        if (!validation.isValid) {
            return {
                hasPermission: false,
                reason: 'Usuario no válido'
            };
        }

        const userRole = validation.userData.cargo_nombre?.toLowerCase();
        
        // Definir permisos por rol
        const rolePermissions = {
            'gerente': [
                'create_property', 'update_property', 'delete_property', 'search_properties',
                'create_agent', 'update_agent', 'toggle_agent', 'list_agents', 
                'create_client', 'update_client', 'delete_client', 'list_clients',
                'view_reports', 'daily_report', 'monthly_report'
            ],
            'agente': [
                'create_property', 'update_property', 'search_properties',
                'create_client', 'update_client', 'list_clients',
                'view_own_properties'
            ]
        };

        const userPermissions = rolePermissions[userRole] || [];
        
        const hasAllPermissions = requiredPermissions.every(permission => 
            userPermissions.includes(permission)
        );

        return {
            hasPermission: hasAllPermissions,
            userRole,
            userPermissions,
            requiredPermissions
        };
    }

    // Obtener información extendida del usuario
    async getUserDetails(phoneNumber) {
        const validation = await this.validateUser(phoneNumber);
        
        if (!validation.isValid) {
            return null;
        }

        // Agregar información adicional si es necesario
        const userDetails = {
            ...validation.userData,
            cleanPhone: this.cleanPhoneNumber(phoneNumber),
            isActive: validation.userData.estado === 1,
            lastValidated: new Date(validation.timestamp)
        };

        return userDetails;
    }

    // Cache methods - using in-memory cache with TTL

    // Verificar conectividad con base de datos
    async testDatabaseConnection() {
        try {
            const response = await axios.get(`${this.databaseUrl}/api/health`, {
                timeout: 5000
            });

            if (response.data.success) {
                console.log('✅ Conectividad con base de datos verificada');
                return true;
            } else {
                throw new Error('Base de datos reportó estado no saludable');
            }

        } catch (error) {
            console.error('❌ Error conectando con base de datos:', error.message);
            throw new Error(`Base de datos no disponible: ${error.message}`);
        }
    }

    // Validar múltiples usuarios de una vez (para batch processing)
    async validateMultipleUsers(phoneNumbers) {
        const validations = {};
        
        const promises = phoneNumbers.map(async (phone) => {
            try {
                const validation = await this.validateUser(phone);
                validations[phone] = validation;
            } catch (error) {
                validations[phone] = {
                    isValid: false,
                    error: error.message
                };
            }
        });

        await Promise.all(promises);
        return validations;
    }

    // Obtener usuarios válidos únicamente
    async getValidUsers(phoneNumbers) {
        const validations = await this.validateMultipleUsers(phoneNumbers);
        const validUsers = {};

        for (const [phone, validation] of Object.entries(validations)) {
            if (validation.isValid) {
                validUsers[phone] = validation.userData;
            }
        }

        return validUsers;
    }

    // ==================== MÉTODOS DE CACHE ====================
    
    // Obtener validación desde cache
    getCachedValidation(phoneNumber) {
        const cached = this.validationCache.get(phoneNumber);
        
        if (!cached) return null;
        
        // Verificar si no ha expirado
        if (Date.now() - cached.cachedAt > this.cacheTimeout) {
            this.validationCache.delete(phoneNumber);
            return null;
        }
        
        // Actualizar timestamp para reflejar uso desde cache
        return {
            ...cached.validation,
            timestamp: Date.now(),
            fromCache: true
        };
    }
    
    // Guardar validación en cache
    setCachedValidation(phoneNumber, validation) {
        // Solo cachear validaciones exitosas
        if (validation.isValid) {
            this.validationCache.set(phoneNumber, {
                validation,
                cachedAt: Date.now()
            });
            console.log(`💾 Usuario cacheado: ${phoneNumber} (${validation.userData?.nombre})`);
        }
    }
    
    // Limpiar entries expirados del cache
    cleanExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [phone, cached] of this.validationCache.entries()) {
            if (now - cached.cachedAt > this.cacheTimeout) {
                this.validationCache.delete(phone);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cache limpiado: ${cleaned} entries expirados removidos`);
        }
    }
    
    // Limpiar todo el cache (util para testing o reset)
    clearCache() {
        const size = this.validationCache.size;
        this.validationCache.clear();
        console.log(`🗑️ Cache completamente limpiado: ${size} entries removidos`);
    }
    
    // Obtener estadísticas del cache
    getCacheStats() {
        return {
            size: this.validationCache.size,
            timeout: this.cacheTimeout,
            entries: Array.from(this.validationCache.keys())
        };
    }
}

module.exports = UserValidator;