// servidor/modulo-whatsapp/src/services/messageProcessor.js

const axios = require('axios');

class MessageProcessor {
    constructor() {
        this.databaseUrl = null;
        this.processingUrl = null;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        // Contadores para estadísticas
        this.stats = {
            clientMessagesProcessed: 0,
            systemMessagesProcessed: 0,
            totalErrors: 0,
            lastProcessedAt: null
        };
    }

    // Configurar URLs
    configure(config) {
        this.databaseUrl = config.databaseUrl;
        this.processingUrl = config.processingUrl;

        console.log('🔧 MessageProcessor configurado:');
        console.log(`   Database: ${this.databaseUrl}`);
        console.log(`   Processing: ${this.processingUrl}`);
    }

    // Procesar mensaje de cliente (recibido en sesión AGENTE)
    async processClientMessage(messageData) {
        console.log(`📨 Procesando mensaje de CLIENTE: ${messageData.from}`);

        try {
            this.stats.clientMessagesProcessed++;
            this.stats.lastProcessedAt = new Date();

            // Preparar datos para el módulo de procesamiento (caso: cliente → agente)
            const processingData = {
                id: messageData.id,
                from: messageData.from,
                to: messageData.to, // teléfono del agente
                body: messageData.body,
                type: messageData.type,
                timestamp: messageData.timestamp,
                source: 'whatsapp-web-agent',
                messageFlow: 'client-to-agent',
                sessionInfo: {
                    sessionType: messageData.sessionType,
                    sessionName: messageData.sessionName
                }
            };

            console.log(`📤 Enviando al módulo de procesamiento...`);

            // Enviar al módulo de procesamiento
            const response = await this.sendToGateway(processingData, 'client-message');
            if (response.success) {
                console.log(`✅ Mensaje de cliente procesado exitosamente`);
                return response;
            } else {
                throw new Error(response.error || 'Error en procesamiento');
            }

        } catch (error) {
            console.error(`❌ Error procesando mensaje de cliente:`, error.message);
            this.stats.totalErrors++;

            // Guardar mensaje fallido para reprocesar
            await this.saveFailedMessage(messageData, error.message, 'client');
            throw error;
        }
    }

    // Procesar mensaje del sistema (recibido en sesión SISTEMA)
    async processSystemMessage(messageData) {
        console.log('🔧 INICIO processSystemMessage');
        console.log('📱 Datos recibidos:', {
            from: messageData.from,
            to: messageData.to,
            body: messageData.body,
            sessionType: messageData.sessionType
        });

        try {
            // 1. Validar usuario - MÁS LOGS
            console.log('🔍 Validando usuario:', messageData.from);
            const userValidation = await this.validateUser(messageData.from);
            console.log('✅ Resultado validación:', userValidation);

            if (!userValidation.isValid) {
                console.log('❌ USUARIO NO VÁLIDO - No se enviará respuesta');
                return {
                    processed: false,
                    reason: 'Usuario no registrado',
                    phone: messageData.from
                };
            }

            console.log('✅ Usuario VÁLIDO:', {
                nombre: userValidation.user.nombre,
                cargo: userValidation.user.cargo_nombre,
                id: userValidation.user.id
            });

            // 2. Preparar datos para el módulo de procesamiento
            const processingData = {
                id: messageData.id,
                from: messageData.from,
                to: messageData.to,
                body: messageData.body,
                type: messageData.type || 'text',
                timestamp: messageData.timestamp,
                source: 'whatsapp-web',
                direction: 'incoming',
                userData: userValidation.user,
                processed: false,
                response_sent: false
            };

            console.log('📤 Enviando al módulo de procesamiento...');

            // 3. Enviar al módulo de procesamiento
            const response = await this.sendToGateway(processingData, 'system-command');
            console.log('✅ Respuesta del procesamiento:', response);
            return response;

        } catch (error) {
            console.error('❌ ERROR COMPLETO:', error);
            throw error;
        }
    }
    // Validar usuario en la base de datos
    async validateUser(phoneNumber) {
        try {
            const cleanPhone = this.cleanPhoneNumber(phoneNumber);

            console.log(`🔍 Validando usuario en BD: ${cleanPhone}`);

            const response = await axios.get(
                `${this.databaseUrl}/api/users/validate/${cleanPhone}`,
                {
                    timeout: 5000,
                    headers: {
                        'X-Source': 'whatsapp-message-processor'
                    }
                }
            );

            if (response.data.valid && response.data.data) {
                return {
                    isValid: true,
                    user: response.data.data
                };
            }

            return {
                isValid: false,
                user: null
            };

        } catch (error) {
            console.error(`❌ Error validando usuario:`, error.message);

            // En caso de error de BD, asumir que no es válido
            return {
                isValid: false,
                user: null,
                error: error.message
            };
        }
    }

    // Enviar datos al módulo de procesamiento
    async sendToGateway(messageData, messageType, attempt = 1) {
        // Definir endpoint y URL fuera del try para que estén disponibles en catch
        const endpoint = '/api/process/message';
        const processingUrl = this.processingUrl || 'http://localhost:3002';
        try {
            console.log(`📡 ENVIANDO AL MÓDULO DE PROCESAMIENTO:`);
            console.log(`   🌐 URL: ${processingUrl}${endpoint}`);
            console.log(`   📦 Data:`, JSON.stringify({
                from: messageData.from,
                body: messageData.body,
                messageType: messageType,
                sessionType: messageData.sessionType
            }, null, 2));
            const response = await axios.post(
                `${processingUrl}${endpoint}`,
                {
                    ...messageData,
                    messageType: messageType
                },
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'whatsapp-module',
                        'X-Message-Type': messageType
                    }
                }
            );
            console.log(`✅ RESPUESTA DEL PROCESAMIENTO:`, response.data);
            return response.data;
        } catch (error) {
            console.error(`❌ INTENTO ${attempt} FALLÓ:`);
            console.error(`   🔗 URL: ${this.processingUrl || 'http://localhost:3002'}${endpoint}`);
            console.error(`   ❌ Error: ${error.message}`);
            if (error.code === 'ECONNREFUSED') {
                console.error(`   🔌 CONEXIÓN RECHAZADA - ¿Está ejecutándose el módulo de procesamiento?`);
            }
            if (attempt < this.retryAttempts) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms... (${attempt}/${this.retryAttempts})`);
                await this.sleep(this.retryDelay);
                return this.sendToGateway(messageData, messageType, attempt + 1);
            } else {
                throw new Error(`Módulo de procesamiento no disponible después de ${this.retryAttempts} intentos: ${error.message}`);
            }
        }
    }

    // Guardar mensaje fallido para reprocesar
    async saveFailedMessage(messageData, errorMessage, messageFlow) {
        try {
            const failedMessage = {
                ...messageData,
                error: errorMessage,
                messageFlow: messageFlow,
                failedAt: new Date(),
                processed: false,
                retryCount: 0
            };

            console.log(`💾 Mensaje fallido guardado: ${failedMessage.id} (${messageFlow})`);

            // En una implementación completa, esto se guardaría en Redis o BD
            // Por ahora solo lo registramos en consola

        } catch (error) {
            console.error(`❌ Error guardando mensaje fallido:`, error.message);
        }
    }

    // Limpiar número de teléfono
    cleanPhoneNumber(phone) {
        // Remover @c.us si está presente ANTES de eliminar otros caracteres
        let cleaned = phone.replace('@c.us', '');

        // Eliminar caracteres no numéricos 
        cleaned = cleaned.replace(/\D/g, '');

        // Los números en BD empiezan con '59' (Bolivia), no '591'
        // No necesitamos agregar código de país adicional
        console.log(`📞 Número limpiado: ${phone} → ${cleaned}`);

        return cleaned;
    }

    // Validar formato de número de teléfono
    validatePhoneNumber(phone) {
        if (!phone) return false;

        const cleanPhone = phone.replace(/[^\d+]/g, '');
        const phoneDigits = cleanPhone.replace('+', '');

        // Verificar longitud mínima para Bolivia (591 + 8 dígitos)
        return phoneDigits.length >= 11 && phoneDigits.startsWith('591');
    }

    // Limpiar contenido de mensaje
    cleanMessageContent(content) {
        if (!content) return '';

        return content
            .replace(/[\r\n\t]/g, ' ')    // Normalizar espacios en blanco
            .replace(/\s+/g, ' ')         // Múltiples espacios a uno
            .trim()                       // Quitar espacios inicio/fin
            .substring(0, 4000);          // Límite WhatsApp
    }

    // Extraer contenido según tipo de mensaje
    extractMessageContent(messageData) {
        switch (messageData.type) {
            case 'chat':
                return messageData.body || '';

            case 'image':
                return `[IMAGEN]${messageData.caption ? ` ${messageData.caption}` : ''}`;

            case 'video':
                return `[VIDEO]${messageData.caption ? ` ${messageData.caption}` : ''}`;

            case 'audio':
            case 'ptt':
                return '[AUDIO]';

            case 'document':
                return `[DOCUMENTO]${messageData.filename ? ` ${messageData.filename}` : ''}`;

            case 'location':
                return `[UBICACIÓN] ${messageData.latitude || ''}, ${messageData.longitude || ''}`;

            case 'vcard':
                return '[CONTACTO]';

            case 'sticker':
                return '[STICKER]';

            default:
                return `[${messageData.type?.toUpperCase() || 'UNKNOWN'}]`;
        }
    }


    // Verificar conectividad con base de datos
    async checkDatabaseHealth() {
        try {
            const response = await axios.get(`${this.databaseUrl}/api/health`, {
                timeout: 5000
            });

            return {
                available: true,
                status: response.data
            };
        } catch (error) {
            console.error(`❌ Base de datos no disponible:`, error.message);
            return {
                available: false,
                error: error.message
            };
        }
    }

    // Obtener estadísticas
    getStats() {
        return {
            ...this.stats,
            databaseUrl: this.databaseUrl,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay
        };
    }

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Procesar cola de mensajes fallidos (para implementación futura)
    async processFailedMessages() {
        console.log('🔄 Procesando mensajes fallidos...');

        // Aquí se implementaría la lógica para reprocesar mensajes fallidos
        // desde Redis o base de datos

        return {
            processed: 0,
            failed: 0,
            message: 'Función no implementada aún'
        };
    }

    // Dividir mensajes largos para WhatsApp
    splitLongMessage(message, maxLength = 4000) {
        if (message.length <= maxLength) {
            return [message];
        }

        const messages = [];
        let currentMessage = '';
        const lines = message.split('\n');

        for (const line of lines) {
            if ((currentMessage + line + '\n').length > maxLength) {
                if (currentMessage) {
                    messages.push(currentMessage.trim());
                    currentMessage = '';
                }

                // Si una línea individual es muy larga, cortarla por palabras
                if (line.length > maxLength) {
                    const words = line.split(' ');
                    for (const word of words) {
                        if ((currentMessage + word + ' ').length > maxLength) {
                            messages.push(currentMessage.trim());
                            currentMessage = word + ' ';
                        } else {
                            currentMessage += word + ' ';
                        }
                    }
                } else {
                    currentMessage = line + '\n';
                }
            } else {
                currentMessage += line + '\n';
            }
        }

        if (currentMessage) {
            messages.push(currentMessage.trim());
        }

        return messages;
    }
}

module.exports = MessageProcessor;