// servidor/modulo-respuestas/src/services/whatsAppConnector.js

const axios = require('axios');

class WhatsAppConnector {
    constructor() {
        this.whatsappWebUrl = process.env.WHATSAPP_URL || 'http://localhost:3001';
        this.whatsappApiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
        this.apiToken = process.env.WHATSAPP_API_TOKEN;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.timeout = 30000; // 30 segundos
    }

    // Enviar mensaje vía WhatsApp-Web (para clientes)
    async sendViaWhatsAppWeb(messageData) {
        console.log('📱 Enviando vía WhatsApp-Web:', {
            agent: messageData.agentPhone,
            to: messageData.to
        });

        try {
            // Formatear número de destino
            const cleanTo = this.cleanPhoneNumber(messageData.to);

            // Preparar request para WhatsApp-Web
            const requestData = {
                to: cleanTo,
                message: messageData.message
            };

            // Agregar archivos multimedia si existen
            if (messageData.mediaFiles && messageData.mediaFiles.length > 0) {
                // Por ahora enviar solo el primer archivo
                const firstMedia = messageData.mediaFiles[0];
                requestData.mediaUrl = firstMedia.url || firstMedia.path;
                requestData.mediaType = firstMedia.type;
            }

            // Enviar a través del módulo WhatsApp
            const response = await axios.post(
                `${this.whatsappWebUrl}/api/sessions/${encodeURIComponent(messageData.agentPhone)}/send`,
                requestData,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'response-module'
                    }
                }
            );

            if (response.data.success) {
                console.log('✅ Mensaje enviado vía WhatsApp-Web');
                return {
                    success: true,
                    messageId: response.data.data.messageId,
                    timestamp: response.data.data.timestamp
                };
            } else {
                throw new Error(response.data.error || 'Error enviando mensaje');
            }

        } catch (error) {
            console.error('❌ Error en WhatsApp-Web:', error.message);
            
            if (error.response) {
                throw new Error(`WhatsApp-Web error: ${error.response.data?.error || error.response.status}`);
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error('Módulo WhatsApp no disponible');
            } else {
                throw error;
            }
        }
    }

    // Enviar mensaje vía API oficial (para sistema)
    async sendViaAPI(messageData) {
        console.log('🌐 Enviando vía API oficial de WhatsApp');

        // Verificar configuración
        if (!this.apiToken || !this.phoneNumberId) {
            console.log('⚠️ API de WhatsApp no configurada, simulando envío');
            return this.simulateAPISend(messageData);
        }

        try {
            const cleanTo = this.cleanPhoneNumber(messageData.to);

            // Preparar payload según especificación de WhatsApp API
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanTo,
                type: 'text',
                text: {
                    preview_url: false,
                    body: messageData.message
                }
            };

            // Si hay media, cambiar el tipo
            if (messageData.mediaUrl) {
                payload.type = this.getMediaType(messageData.mediaType);
                delete payload.text;
                
                payload[payload.type] = {
                    link: messageData.mediaUrl
                };

                if (messageData.caption) {
                    payload[payload.type].caption = messageData.caption;
                }
            }

            // Enviar a WhatsApp API
            const response = await axios.post(
                `${this.whatsappApiUrl}/${this.phoneNumberId}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.timeout
                }
            );

            console.log('✅ Mensaje enviado vía API oficial');

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ Error en API oficial:', error.response?.data || error.message);
            
            if (error.response?.status === 401) {
                throw new Error('Token de API inválido');
            } else if (error.response?.status === 400) {
                throw new Error(`Error de API: ${error.response.data.error?.message || 'Solicitud inválida'}`);
            } else {
                throw new Error(`Error enviando por API: ${error.message}`);
            }
        }
    }

    // Simular envío por API (para desarrollo)
    simulateAPISend(messageData) {
        console.log('🎭 Simulando envío por API oficial');
        console.log('📱 Para:', messageData.to);
        console.log('💬 Mensaje:', messageData.message?.substring(0, 100));

        return {
            success: true,
            messageId: `sim_api_${Date.now()}`,
            timestamp: new Date(),
            simulated: true
        };
    }

    // Enviar plantilla de WhatsApp
    async sendTemplate(templateData) {
        console.log('📋 Enviando plantilla de WhatsApp');

        if (!this.apiToken || !this.phoneNumberId) {
            console.log('⚠️ API no configurada para plantillas');
            return this.simulateTemplateSend(templateData);
        }

        try {
            const payload = {
                messaging_product: 'whatsapp',
                to: this.cleanPhoneNumber(templateData.to),
                type: 'template',
                template: {
                    name: templateData.templateName,
                    language: {
                        code: templateData.language || 'es'
                    }
                }
            };

            // Agregar componentes/parámetros si existen
            if (templateData.components) {
                payload.template.components = templateData.components;
            }

            const response = await axios.post(
                `${this.whatsappApiUrl}/${this.phoneNumberId}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.timeout
                }
            );

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ Error enviando plantilla:', error.response?.data || error.message);
            throw new Error(`Error enviando plantilla: ${error.message}`);
        }
    }

    // Simular envío de plantilla
    simulateTemplateSend(templateData) {
        console.log('🎭 Simulando envío de plantilla');
        console.log('📋 Plantilla:', templateData.templateName);
        console.log('📱 Para:', templateData.to);

        return {
            success: true,
            messageId: `sim_template_${Date.now()}`,
            timestamp: new Date(),
            simulated: true
        };
    }

    // Obtener estado de mensaje
    async getMessageStatus(messageId) {
        // Por implementar cuando se necesite
        return {
            messageId,
            status: 'sent',
            timestamp: new Date()
        };
    }

    // Verificar si un agente está disponible
    async isAgentAvailable(agentPhone) {
        try {
            const response = await axios.get(
                `${this.whatsappWebUrl}/api/sessions/status`,
                { timeout: 5000 }
            );

            const sessions = response.data.data.sessions || [];
            const agentSession = sessions.find(s => s.agentPhone === agentPhone);

            return agentSession && agentSession.status === 'ready';

        } catch (error) {
            console.error('⚠️ Error verificando disponibilidad del agente:', error.message);
            return false;
        }
    }

    // Obtener agente disponible para asignar
    async getAvailableAgent() {
        try {
            const response = await axios.get(
                `${this.whatsappWebUrl}/api/sessions/status`,
                { timeout: 5000 }
            );

            const sessions = response.data.data.sessions || [];
            const availableSessions = sessions.filter(s => s.status === 'ready');

            if (availableSessions.length === 0) {
                throw new Error('No hay agentes disponibles');
            }

            // Seleccionar el agente con menos actividad reciente
            const selectedAgent = availableSessions.reduce((prev, current) => {
                return (prev.messagesSent < current.messagesSent) ? prev : current;
            });

            return selectedAgent.agentPhone;

        } catch (error) {
            console.error('⚠️ Error obteniendo agente disponible:', error.message);
            throw new Error('No se pudo asignar un agente');
        }
    }

    // Limpiar número de teléfono
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        
        // Remover @c.us si existe
        let cleaned = phoneNumber.replace('@c.us', '');
        
        // Remover caracteres no numéricos excepto +
        cleaned = cleaned.replace(/[^\d+]/g, '');
        
        // Asegurar formato internacional
        if (!cleaned.startsWith('+')) {
            // Asumir Bolivia si no tiene código de país
            if (cleaned.startsWith('591')) {
                cleaned = '+' + cleaned;
            } else if (cleaned.length === 8) {
                cleaned = '+591' + cleaned;
            }
        }
        
        return cleaned;
    }

    // Determinar tipo de media para API
    getMediaType(mimeType) {
        if (!mimeType) return 'document';
        
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        
        return 'document';
    }

    // Validar configuración
    validateConfiguration() {
        const config = {
            whatsappWeb: true,
            whatsappApi: !!(this.apiToken && this.phoneNumberId)
        };

        if (!config.whatsappApi) {
            console.log('⚠️ API oficial de WhatsApp no configurada');
            console.log('   Configura WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env');
        }

        return config;
    }
}

module.exports = WhatsAppConnector;