// servidor/modulo-whatsapp/src/services/messageProcessor.js

const axios = require('axios');

class MessageProcessor {
    constructor() {
        this.gatewayUrl = null;
        this.databaseUrl = null;
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
        this.gatewayUrl = config.gatewayUrl;
        this.databaseUrl = config.databaseUrl;
        
        console.log('🔧 MessageProcessor configurado:');
        console.log(`   Gateway: ${this.gatewayUrl}`);
        console.log(`   Database: ${this.databaseUrl}`);
    }

    // Procesar mensaje de cliente (recibido en sesión AGENTE)
    async processClientMessage(messageData) {
        console.log(`📨 Procesando mensaje de CLIENTE: ${messageData.from}`);

        try {
            this.stats.clientMessagesProcessed++;
            this.stats.lastProcessedAt = new Date();

            // Preparar datos para el gateway (caso: cliente → agente)
            const gatewayData = {
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

            console.log(`📤 Enviando al gateway para procesamiento con IA...`);

            // Enviar al gateway para procesamiento con IA
            const response = await this.sendToGateway(gatewayData, 'client-message');

            if (response.success) {
                console.log(`✅ Mensaje de cliente procesado exitosamente`);
                return response;
            } else {
                throw new Error(response.error || 'Gateway reportó error');
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
        console.log(`🔧 Procesando comando de SISTEMA: ${messageData.from}`);

        try {
            this.stats.systemMessagesProcessed++;
            this.stats.lastProcessedAt = new Date();

            // 1. Validar si el remitente es agente/gerente registrado
            const userValidation = await this.validateUser(messageData.from);

            if (!userValidation.isValid) {
                console.log(`❌ Usuario NO REGISTRADO: ${messageData.from}`);
                // No responder según la lógica de negocio
                return {
                    processed: false,
                    reason: 'Usuario no registrado'
                };
            }

            console.log(`✅ Usuario VALIDADO: ${userValidation.user.nombre} (${userValidation.user.cargo_nombre})`);

            // 2. Preparar datos para el gateway (caso: agente/gerente → sistema)
            const gatewayData = {
                id: messageData.id,
                from: messageData.from,
                to: messageData.to, // teléfono del sistema
                body: messageData.body,
                type: messageData.type,
                timestamp: messageData.timestamp,
                source: 'whatsapp-web-system',
                messageFlow: 'agent-to-system',
                userData: userValidation.user,
                sessionInfo: {
                    sessionType: messageData.sessionType,
                    sessionName: messageData.sessionName
                }
            };

            console.log(`📤 Enviando comando al gateway para procesamiento...`);

            // 3. Enviar al gateway para procesamiento de backend
            const response = await this.sendToGateway(gatewayData, 'system-command');

            if (response.success) {
                console.log(`✅ Comando del sistema procesado exitosamente`);
                return response;
            } else {
                throw new Error(response.error || 'Gateway reportó error');
            }

        } catch (error) {
            console.error(`❌ Error procesando comando del sistema:`, error.message);
            this.stats.totalErrors++;
            
            // Enviar mensaje de error al usuario si está registrado
            if (messageData.from) {
                // Nota: Esto requeriría acceso al sessionManager para enviar respuesta
                // Por ahora solo loggear
                console.log(`💌 Debería enviar error a: ${messageData.from}`);
            }
            
            await this.saveFailedMessage(messageData, error.message, 'system');
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

    // Enviar datos al gateway
    async sendToGateway(messageData, messageType, attempt = 1) {
        try {
            const endpoint = messageType === 'client-message' 
                ? '/api/whatsapp/message'  // Para mensajes de cliente
                : '/api/whatsapp/command'; // Para comandos del sistema

            console.log(`📡 Enviando al gateway: ${this.gatewayUrl}${endpoint}`);

            const response = await axios.post(
                `${this.gatewayUrl}${endpoint}`,
                {
                    ...messageData,
                    messageType: messageType
                },
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'whatsapp-message-processor',
                        'X-Message-Type': messageType
                    }
                }
            );

            return response.data;

        } catch (error) {
            console.error(`❌ Intento ${attempt} falló:`, error.message);

            if (attempt < this.retryAttempts) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms... (${attempt}/${this.retryAttempts})`);
                
                await this.sleep(this.retryDelay);
                return this.sendToGateway(messageData, messageType, attempt + 1);
            } else {
                throw new Error(`Gateway no disponible después de ${this.retryAttempts} intentos`);
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
        // Eliminar caracteres no numéricos
        let cleaned = phone.replace(/\D/g, '');
        
        // Remover @c.us si está presente
        cleaned = cleaned.replace('@c.us', '');
        
        // Asegurar formato con código de país (Bolivia 591)
        if (!cleaned.startsWith('591')) {
            // Si empieza con 7 u 8 (números móviles Bolivia), agregar 591
            if (cleaned.match(/^[678]/)) {
                cleaned = '591' + cleaned;
            }
        }
        
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

    // Verificar conectividad con gateway
    async checkGatewayHealth() {
        try {
            const response = await axios.get(`${this.gatewayUrl}/api/health`, {
                timeout: 5000
            });
            
            return {
                available: true,
                status: response.data
            };
        } catch (error) {
            console.error(`❌ Gateway no disponible:`, error.message);
            return {
                available: false,
                error: error.message
            };
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
            gatewayUrl: this.gatewayUrl,
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