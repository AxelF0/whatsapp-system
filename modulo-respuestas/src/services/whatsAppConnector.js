// servidor/modulo-respuestas/src/services/whatsAppConnector.js

const axios = require('axios');

class WhatsAppConnector {
    constructor() {
        this.whatsappWebUrl = process.env.WHATSAPP_URL || 'http://localhost:3001';
        this.timeout = 30000; // 30 segundos
    }

    // Enviar mensaje vía WhatsApp-Web
    async sendViaWhatsAppWeb(messageData) {
        console.log('📱 Enviando vía WhatsApp-Web:', {
            type: messageData.type || 'client',
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

            // Determinar la ruta correcta según el tipo de mensaje
            const endpoint = messageData.type === 'system'
                ? `${this.whatsappWebUrl}/api/system/send`
                : `${this.whatsappWebUrl}/api/sessions/${encodeURIComponent(messageData.agentPhone)}/send`;

            // Enviar a través del módulo WhatsApp
            const response = await axios.post(
                endpoint,
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
}

module.exports = WhatsAppConnector;