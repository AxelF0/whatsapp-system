// servidor/modulo-whatsapp/src/services/whatsAppApiService.js
// VERSIÓN CON MODO DESARROLLO MEJORADO

const axios = require('axios');
const EventEmitter = require('events');

class WhatsAppApiService extends EventEmitter {
    constructor() {
        super();
        
        this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'bolivia_remax_2024_secure_token';
        
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
        this.systemNumber = process.env.SYSTEM_WHATSAPP_NUMBER || '59180000000';
        
        // Detectar modo desarrollo
        this.developmentMode = !this.phoneNumberId || !this.accessToken || 
                              process.env.FORCE_SIMULATION_MODE === 'true' ||
                              process.env.NODE_ENV === 'development';
        
        this.isReady = this.developmentMode; // En desarrollo, siempre listo
        this.webhookUrl = null;
    }

    async initialize() {
        console.log('Inicializando API Oficial de WhatsApp...');
        
        if (this.developmentMode) {
            console.log('MODO DESARROLLO: API funcionará en simulación');
            console.log(`Número del sistema (simulado): ${this.systemNumber}`);
            
            this.isReady = true;
            this.emit('ready', {
                display_phone_number: this.systemNumber,
                verified_name: 'Sistema de Prueba',
                simulation: true
            });
            
            return {
                success: true,
                phoneNumber: this.systemNumber,
                status: 'ready',
                mode: 'simulation'
            };
        }
        
        try {
            if (!this.phoneNumberId || !this.accessToken) {
                throw new Error('Faltan credenciales de WhatsApp API');
            }

            const phoneStatus = await this.getPhoneNumberStatus();
            const isVerified = (phoneStatus.code_verification_status || '').toUpperCase() === 'VERIFIED';
            const allowUnverified = String(process.env.WHATSAPP_ALLOW_UNVERIFIED || 'false').toLowerCase() === 'true';

            if (isVerified || allowUnverified) {
                console.log(`Número del sistema: ${phoneStatus.display_phone_number}`);
                this.isReady = true;
                this.emit('ready', phoneStatus);
            } else {
                console.warn('Número no verificado. Establece WHATSAPP_ALLOW_UNVERIFIED=true para desarrollo.');
                this.isReady = false;
            }

            return {
                success: true,
                phoneNumber: phoneStatus.display_phone_number,
                status: 'ready'
            };

        } catch (error) {
            console.error('Error inicializando API de WhatsApp:', error.message);
            console.log('Cambiando a modo simulación...');
            
            // Fallback a modo simulación
            this.developmentMode = true;
            this.isReady = true;
            
            this.emit('ready', {
                display_phone_number: this.systemNumber,
                verified_name: 'Sistema Fallback',
                simulation: true
            });
            
            return {
                success: true,
                phoneNumber: this.systemNumber,
                status: 'ready',
                mode: 'simulation_fallback'
            };
        }
    }

    async getPhoneNumberStatus() {
        if (this.developmentMode) {
            return {
                display_phone_number: this.systemNumber,
                verified_name: 'Sistema de Desarrollo',
                code_verification_status: 'VERIFIED'
            };
        }

        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.phoneNumberId}`,
                {
                    params: {
                        fields: 'display_phone_number,verified_name,code_verification_status'
                    },
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return response.data;

        } catch (error) {
            console.error('Error obteniendo estado del número:', error.response?.data || error.message);
            throw new Error('No se pudo verificar el estado del número');
        }
    }

    async sendTextMessage(to, message, replyToMessageId = null) {
        console.log(`Enviando mensaje vía API oficial a: ${to}`);

        if (this.developmentMode) {
            return this.simulateAPISend({ to, message, replyToMessageId });
        }

        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: this.formatPhoneNumber(to),
                type: 'text',
                text: {
                    preview_url: false,
                    body: message
                }
            };

            if (replyToMessageId) {
                payload.context = {
                    message_id: replyToMessageId
                };
            }

            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Mensaje enviado exitosamente via API oficial');

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error enviando mensaje:', error.response?.data || error.message);
            
            // Fallback a simulación en caso de error
            console.log('Usando simulación como fallback...');
            return this.simulateAPISend({ to, message, replyToMessageId, fallback: true });
        }
    }

    async sendInteractiveMessage(to, bodyText, buttons, headerText = null, footerText = null) {
        if (this.developmentMode) {
            return this.simulateAPISend({ to, bodyText, type: 'interactive', buttons });
        }

        console.log(`Enviando mensaje interactivo a: ${to}`);

        try {
            const interactive = {
                type: 'button',
                body: {
                    text: bodyText
                },
                action: {
                    buttons: buttons.map((button, index) => ({
                        type: 'reply',
                        reply: {
                            id: button.id || `button_${index}`,
                            title: button.title.substring(0, 20)
                        }
                    }))
                }
            };

            if (headerText) {
                interactive.header = {
                    type: 'text',
                    text: headerText
                };
            }

            if (footerText) {
                interactive.footer = {
                    text: footerText
                };
            }

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: this.formatPhoneNumber(to),
                type: 'interactive',
                interactive: interactive
            };

            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error enviando mensaje interactivo:', error.response?.data || error.message);
            // Fallback a simulación
            return this.simulateAPISend({ to, bodyText, type: 'interactive', buttons, fallback: true });
        }
    }

    simulateAPISend(messageData) {
        const mode = messageData.fallback ? 'FALLBACK' : 'DESARROLLO';
        console.log(`[${mode}] Simulando envío por API oficial`);
        console.log(`[${mode}] Para: ${messageData.to}`);
        console.log(`[${mode}] Mensaje: ${(messageData.message || messageData.bodyText || '').substring(0, 100)}`);

        return {
            success: true,
            messageId: `sim_api_${Date.now()}`,
            timestamp: new Date(),
            simulated: true,
            mode: mode.toLowerCase()
        };
    }

    async markAsRead(messageId) {
        if (this.developmentMode) {
            console.log(`[SIMULACIÓN] Marcando mensaje como leído: ${messageId}`);
            return { success: true, simulated: true };
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return { success: true };

        } catch (error) {
            console.error('Error marcando mensaje como leído (usando simulación):', error.message);
            return { success: true, simulated: true, error: error.message };
        }
    }

    async processWebhook(body) {
        console.log('Procesando webhook de WhatsApp API');

        try {
            if (!body.entry || !Array.isArray(body.entry)) {
                console.log('Webhook sin entradas válidas');
                return { processed: false, reason: 'No entries' };
            }

            const results = [];

            for (const entry of body.entry) {
                const changes = entry.changes || [];
                
                for (const change of changes) {
                    if (change.field === 'messages') {
                        const value = change.value;
                        
                        if (value.messages && Array.isArray(value.messages)) {
                            for (const message of value.messages) {
                                const processedMessage = await this.processIncomingMessage(message, value);
                                results.push(processedMessage);
                            }
                        }

                        if (value.statuses && Array.isArray(value.statuses)) {
                            for (const status of value.statuses) {
                                this.processMessageStatus(status);
                            }
                        }
                    }
                }
            }

            return {
                processed: true,
                messages: results
            };

        } catch (error) {
            console.error('Error procesando webhook:', error.message);
            throw error;
        }
    }

    async processIncomingMessage(message, context) {
        console.log(`Mensaje recibido de ${message.from}: ${message.type}`);

        try {
            // Marcar como leído (simulado en desarrollo)
            await this.markAsRead(message.id);

            const messageData = {
                id: message.id,
                from: message.from,
                to: this.systemNumber,
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                type: message.type,
                source: 'whatsapp-api'
            };

            switch (message.type) {
                case 'text':
                    messageData.body = message.text.body;
                    break;
                
                case 'interactive':
                    if (message.interactive.type === 'button_reply') {
                        messageData.body = message.interactive.button_reply.title;
                        messageData.buttonId = message.interactive.button_reply.id;
                    } else if (message.interactive.type === 'list_reply') {
                        messageData.body = message.interactive.list_reply.title;
                        messageData.listItemId = message.interactive.list_reply.id;
                    }
                    break;
                
                default:
                    messageData.body = `[${message.type.toUpperCase()}]`;
            }

            this.emit('message', messageData);

            console.log(`Mensaje procesado: "${messageData.body?.substring(0, 50)}..."`);

            return messageData;

        } catch (error) {
            console.error('Error procesando mensaje entrante:', error.message);
            throw error;
        }
    }

    processMessageStatus(status) {
        console.log(`Estado de mensaje ${status.id}: ${status.status}`);
        
        this.emit('message_status', {
            messageId: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            timestamp: new Date(parseInt(status.timestamp) * 1000)
        });
    }

    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');
        
        if (!cleaned.startsWith('591')) {
            cleaned = '591' + cleaned;
        }
        
        return cleaned;
    }

    verifyWebhook(mode, token, challenge) {
        if (mode === 'subscribe' && token === this.verifyToken) {
            console.log('Webhook verificado correctamente');
            return challenge;
        } else {
            console.log('Token de verificación inválido');
            throw new Error('Verificación de webhook fallida');
        }
    }

    getStats() {
        return {
            isReady: this.isReady,
            systemNumber: this.systemNumber,
            phoneNumberId: this.phoneNumberId,
            apiVersion: this.apiVersion,
            developmentMode: this.developmentMode
        };
    }
}

module.exports = WhatsAppApiService;