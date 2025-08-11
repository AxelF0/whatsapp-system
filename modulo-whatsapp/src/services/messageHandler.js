// servidor/modulo-whatsapp/src/services/messageHandler.js

const axios = require('axios');

class MessageHandler {
    constructor() {
        this.gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 segundo
    }

    // Procesar mensaje entrante
    async processMessage(messageData) {
        console.log('📨 Procesando mensaje entrante:', {
            from: messageData.from,
            to: messageData.agentPhone,
            type: messageData.type,
            preview: messageData.body?.substring(0, 50) + '...'
        });

        try {
            // Preparar datos para el gateway
            const gatewayData = {
                id: messageData.id,
                from: messageData.from,
                to: messageData.agentPhone,
                body: this.extractMessageContent(messageData),
                type: messageData.type,
                timestamp: messageData.timestamp,
                source: 'whatsapp-web'
            };

            // Enviar al gateway con reintentos
            const response = await this.sendToGateway(gatewayData);
            
            if (response.success) {
                console.log('✅ Mensaje procesado por el gateway');
                return response;
            } else {
                console.error('❌ Gateway reportó error:', response.error);
                throw new Error(response.error);
            }

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error.message);
            
            // En caso de error, guardar para reprocesar después
            await this.saveFailedMessage(messageData, error.message);
            throw error;
        }
    }

    // Extraer contenido según el tipo de mensaje
    extractMessageContent(messageData) {
        switch (messageData.type) {
            case 'chat':
                return messageData.body || '';
            
            case 'image':
                return `[IMAGEN]${messageData.caption ? ` ${messageData.caption}` : ''}`;
            
            case 'video':
                return `[VIDEO]${messageData.caption ? ` ${messageData.caption}` : ''}`;
            
            case 'audio':
            case 'ptt': // Push to talk
                return '[AUDIO]';
            
            case 'document':
                return `[DOCUMENTO]${messageData.filename ? ` ${messageData.filename}` : ''}`;
            
            case 'sticker':
                return '[STICKER]';
            
            case 'location':
                return `[UBICACIÓN] ${messageData.latitude}, ${messageData.longitude}`;
            
            case 'vcard':
                return '[CONTACTO]';
            
            default:
                return `[${messageData.type?.toUpperCase() || 'UNKNOWN'}]`;
        }
    }

    // Enviar al gateway con reintentos
    async sendToGateway(messageData, attempt = 1) {
        try {
            const response = await axios.post(`${this.gatewayUrl}/api/whatsapp/message`, messageData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'whatsapp-module'
                }
            });

            return response.data;

        } catch (error) {
            console.error(`❌ Intento ${attempt} fallo:`, error.message);

            if (attempt < this.retryAttempts) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms...`);
                
                await this.sleep(this.retryDelay);
                return this.sendToGateway(messageData, attempt + 1);
            } else {
                throw new Error(`Gateway no disponible después de ${this.retryAttempts} intentos`);
            }
        }
    }

    // Guardar mensaje fallido para reprocesar
    async saveFailedMessage(messageData, errorMessage) {
        try {
            const failedMessage = {
                ...messageData,
                error: errorMessage,
                failedAt: new Date(),
                processed: false
            };

            // Aquí podrías guardarlo en una cola o base de datos
            console.log('💾 Guardando mensaje fallido para reprocesar:', failedMessage.id);
            
            // Por ahora solo lo loggeamos
            // En una implementación completa, lo guardarías en Redis o una tabla de cola

        } catch (error) {
            console.error('❌ Error guardando mensaje fallido:', error.message);
        }
    }

    // Procesar respuesta del sistema (para enviar al cliente)
    async processOutgoingResponse(responseData) {
        console.log('📤 Procesando respuesta saliente:', {
            to: responseData.to,
            agentPhone: responseData.agentPhone,
            hasMedia: !!responseData.mediaUrl
        });

        try {
            // Aquí se coordinaría con el SessionManager para enviar
            // Por ahora solo validamos el formato
            
            if (!responseData.to || !responseData.message || !responseData.agentPhone) {
                throw new Error('Faltan datos requeridos: to, message, agentPhone');
            }

            return {
                success: true,
                readyToSend: true,
                data: responseData
            };

        } catch (error) {
            console.error('❌ Error procesando respuesta saliente:', error.message);
            throw error;
        }
    }

    // Validar formato de número de teléfono
    validatePhoneNumber(phone) {
        if (!phone) return false;
        
        // Remover caracteres no numéricos excepto +
        const cleanPhone = phone.replace(/[^\d+]/g, '');
        
        // Debe tener al menos 8 dígitos (sin contar + y código de país)
        const phoneDigits = cleanPhone.replace('+', '');
        
        return phoneDigits.length >= 8;
    }

    // Limpiar formato de mensaje
    cleanMessageContent(content) {
        if (!content) return '';
        
        // Remover caracteres de control y normalizar espacios
        return content
            .replace(/[\r\n\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 4000); // Límite de WhatsApp
    }

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Obtener estadísticas del handler
    getStats() {
        return {
            gatewayUrl: this.gatewayUrl,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay,
            // Aquí podrías agregar contadores de mensajes procesados, etc.
        };
    }

    // Verificar conectividad con gateway
    async checkGatewayHealth() {
        try {
            const response = await axios.get(`${this.gatewayUrl}/api/health`, {
                timeout: 5000
            });
            
            return response.data.success === true;
        } catch (error) {
            console.error('❌ Gateway no disponible:', error.message);
            return false;
        }
    }
}

module.exports = MessageHandler;