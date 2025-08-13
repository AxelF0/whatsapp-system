// servidor/modulo-whatsapp/whatsapp-api/src/services/whatsAppApiService.js

const axios = require('axios');
const EventEmitter = require('events');

class WhatsAppApiService extends EventEmitter {
    constructor() {
        super();
        
        // Configuración de la API oficial de WhatsApp
        this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'remaxexpressbolivia';
        
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
        
        // Número del sistema
        this.systemNumber = process.env.SYSTEM_WHATSAPP_NUMBER || '15551949424';
        
        // Estado del servicio
        this.isReady = false;
        this.webhookUrl = null;
    }

    // Inicializar el servicio
    async initialize() {
        console.log('🌐 Inicializando API Oficial de WhatsApp...');
        
        try {
            // Verificar credenciales
            if (!this.phoneNumberId || !this.accessToken) {
                throw new Error('Faltan credenciales de WhatsApp API (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN)');
            }

            // Verificar el estado del número
            const phoneStatus = await this.getPhoneNumberStatus();

            const isVerified = (phoneStatus.code_verification_status || '').toUpperCase() === 'VERIFIED';
            const allowUnverified = String(process.env.WHATSAPP_ALLOW_UNVERIFIED || 'false').toLowerCase() === 'true';

            if (isVerified || allowUnverified) {
                console.log(`✅ Número del sistema${isVerified ? '' : ' (no verificado, modo permitido)'}: ${phoneStatus.display_phone_number}`);
                console.log(`📱 ID del número: ${this.phoneNumberId}`);
                if (phoneStatus.verified_name) {
                    console.log(`🏢 Cuenta de negocio: ${phoneStatus.verified_name}`);
                }

                this.isReady = true;
                this.emit('ready', phoneStatus);
            } else {
                console.warn('⚠️ El número de WhatsApp no está verificado. Establece WHATSAPP_ALLOW_UNVERIFIED=true para continuar en desarrollo.');
                this.isReady = false;
            }

            return {
                success: true,
                phoneNumber: phoneStatus.display_phone_number,
                businessName: phoneStatus.verified_name,
                status: 'ready'
            };

        } catch (error) {
            console.error('❌ Error inicializando API de WhatsApp:', error.message);
            this.isReady = false;
            throw error;
        }
    }

    // Obtener estado del número de teléfono
    async getPhoneNumberStatus() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.phoneNumberId}`,
                {
                    params: {
                        fields: 'display_phone_number,verified_name,code_verification_status,quality_rating'
                    },
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return response.data;

        } catch (error) {
            console.error('❌ Error obteniendo estado del número:', error.response?.data || error.message);
            throw new Error('No se pudo verificar el estado del número');
        }
    }

    // Enviar mensaje de texto
    async sendTextMessage(to, message, replyToMessageId = null) {
        if (!this.isReady) {
            throw new Error('API de WhatsApp no está lista');
        }

        console.log(`📤 Enviando mensaje vía API oficial a: ${to}`);

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

            // Si es respuesta a un mensaje específico
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

            console.log('✅ Mensaje enviado exitosamente via API oficial');

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
            throw new Error(`Error enviando mensaje: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // Enviar mensaje con botones interactivos
    async sendInteractiveMessage(to, bodyText, buttons, headerText = null, footerText = null) {
        if (!this.isReady) {
            throw new Error('API de WhatsApp no está lista');
        }

        console.log(`📤 Enviando mensaje interactivo a: ${to}`);

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
                            title: button.title.substring(0, 20) // Máximo 20 caracteres
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
            console.error('❌ Error enviando mensaje interactivo:', error.response?.data || error.message);
            throw error;
        }
    }

    // Enviar mensaje con lista
    async sendListMessage(to, bodyText, buttonText, sections, headerText = null, footerText = null) {
        if (!this.isReady) {
            throw new Error('API de WhatsApp no está lista');
        }

        console.log(`📤 Enviando mensaje con lista a: ${to}`);

        try {
            const interactive = {
                type: 'list',
                body: {
                    text: bodyText
                },
                action: {
                    button: buttonText.substring(0, 20),
                    sections: sections
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
            console.error('❌ Error enviando lista:', error.response?.data || error.message);
            throw error;
        }
    }

    // Enviar plantilla de mensaje
    async sendTemplate(to, templateName, languageCode = 'es', components = []) {
        if (!this.isReady) {
            throw new Error('API de WhatsApp no está lista');
        }

        console.log(`📤 Enviando plantilla "${templateName}" a: ${to}`);

        try {
            const payload = {
                messaging_product: 'whatsapp',
                to: this.formatPhoneNumber(to),
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: languageCode
                    }
                }
            };

            if (components.length > 0) {
                payload.template.components = components;
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

            return {
                success: true,
                messageId: response.data.messages[0].id,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ Error enviando plantilla:', error.response?.data || error.message);
            throw error;
        }
    }

    // Marcar mensaje como leído
    async markAsRead(messageId) {
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

            return {
                success: true,
                marked: true
            };

        } catch (error) {
            console.error('⚠️ Error marcando mensaje como leído:', error.response?.data || error.message);
            // No lanzar error aquí porque no es crítico
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Procesar webhook entrante
    async processWebhook(body) {
        console.log('🎯 Procesando webhook de WhatsApp API');

        try {
            // Verificar que el webhook es válido
            if (!body.entry || !Array.isArray(body.entry)) {
                console.log('⚠️ Webhook sin entradas válidas');
                return { processed: false, reason: 'No entries' };
            }

            const results = [];

            for (const entry of body.entry) {
                const changes = entry.changes || [];
                
                for (const change of changes) {
                    // Procesar mensajes
                    if (change.field === 'messages') {
                        const value = change.value;
                        
                        // Procesar mensajes entrantes
                        if (value.messages && Array.isArray(value.messages)) {
                            for (const message of value.messages) {
                                const processedMessage = await this.processIncomingMessage(message, value);
                                results.push(processedMessage);
                            }
                        }

                        // Procesar estados de mensajes
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
            console.error('❌ Error procesando webhook:', error.message);
            throw error;
        }
    }

    // Procesar mensaje entrante
    async processIncomingMessage(message, context) {
        console.log(`📨 Mensaje recibido de ${message.from}: ${message.type}`);

        try {
            // Marcar como leído
            await this.markAsRead(message.id);

            // Extraer información del mensaje
            const messageData = {
                id: message.id,
                from: message.from,
                to: this.systemNumber,
                name: message.profile?.name || 'Usuario',
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                type: message.type,
                source: 'whatsapp-api'
            };

            // Extraer contenido según el tipo
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
                
                case 'image':
                case 'video':
                case 'audio':
                case 'document':
                    messageData.mediaId = message[message.type].id;
                    messageData.caption = message[message.type].caption || '';
                    messageData.body = `[${message.type.toUpperCase()}] ${messageData.caption}`;
                    break;
                
                case 'location':
                    messageData.location = {
                        latitude: message.location.latitude,
                        longitude: message.location.longitude,
                        name: message.location.name,
                        address: message.location.address
                    };
                    messageData.body = `[UBICACIÓN] ${message.location.name || message.location.address || `${message.location.latitude}, ${message.location.longitude}`}`;
                    break;
                
                default:
                    messageData.body = `[${message.type.toUpperCase()}]`;
            }

            // Emitir evento de mensaje recibido
            this.emit('message', messageData);

            console.log(`✅ Mensaje procesado: "${messageData.body?.substring(0, 50)}..."`);

            return messageData;

        } catch (error) {
            console.error('❌ Error procesando mensaje entrante:', error.message);
            throw error;
        }
    }

    // Procesar estado de mensaje
    processMessageStatus(status) {
        console.log(`📊 Estado de mensaje ${status.id}: ${status.status}`);
        
        // Emitir evento de estado
        this.emit('message_status', {
            messageId: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            timestamp: new Date(parseInt(status.timestamp) * 1000),
            errors: status.errors
        });
    }

    // Formatear número de teléfono
    formatPhoneNumber(phone) {
        // Eliminar caracteres no numéricos
        let cleaned = phone.replace(/\D/g, '');
        
        // Si no empieza con código de país, agregar Bolivia (591)
        if (!cleaned.startsWith('591')) {
            cleaned = '591' + cleaned;
        }
        
        return cleaned;
    }

    // Verificar webhook (para configuración inicial)
    verifyWebhook(mode, token, challenge) {
        if (mode === 'subscribe' && token === this.verifyToken) {
            console.log('✅ Webhook verificado correctamente');
            return challenge;
        } else {
            console.log('❌ Token de verificación inválido');
            throw new Error('Verificación de webhook fallida');
        }
    }

    // Obtener plantillas disponibles
    async getMessageTemplates() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.businessAccountId}/message_templates`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return response.data.data;

        } catch (error) {
            console.error('❌ Error obteniendo plantillas:', error.response?.data || error.message);
            throw error;
        }
    }

    // Obtener información del perfil de negocio
    async getBusinessProfile() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`,
                {
                    params: {
                        fields: 'about,address,description,email,profile_picture_url,websites,vertical'
                    },
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return response.data.data[0];

        } catch (error) {
            console.error('❌ Error obteniendo perfil de negocio:', error.response?.data || error.message);
            throw error;
        }
    }

    // Actualizar perfil de negocio
    async updateBusinessProfile(profileData) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`,
                profileData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: response.data.success
            };

        } catch (error) {
            console.error('❌ Error actualizando perfil:', error.response?.data || error.message);
            throw error;
        }
    }

    // Obtener estadísticas
    getStats() {
        return {
            isReady: this.isReady,
            systemNumber: this.systemNumber,
            phoneNumberId: this.phoneNumberId,
            apiVersion: this.apiVersion
        };
    }
}

module.exports = WhatsAppApiService;