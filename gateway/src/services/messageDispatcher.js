class MessageDispatcher {
    constructor(moduleConnector) {
        this.moduleConnector = moduleConnector;
    }

    // Procesar mensaje entrante de WhatsApp-Web.js
    async processIncomingMessage(messageData) {
        console.log('📨 Procesando mensaje entrante:', {
            from: messageData.from,
            to: messageData.to,
            type: messageData.type || 'text'
        });

        try {
            // 1. Guardar mensaje en base de datos
            const savedMessage = await this.moduleConnector.forwardRequest(
                'database',
                '/api/messages',
                'POST',
                {
                    messageId: messageData.id || `msg_${Date.now()}`,
                    from: messageData.from,
                    to: messageData.to,
                    body: messageData.body,
                    type: messageData.type || 'text',
                    direction: 'incoming',
                    source: 'whatsapp-web',
                    timestamp: new Date()
                }
            );

            console.log('✅ Mensaje guardado en BD');

            // 2. Determinar si es consulta de cliente o comando de usuario
            // Por ahora, asumiremos que todo es consulta de cliente
            // Más adelante implementaremos la lógica de detección
            
            const processingResult = {
                type: 'client_query',
                messageId: savedMessage.data._id,
                requiresResponse: true
            };

            console.log('✅ Mensaje clasificado como:', processingResult.type);

            // 3. Si requiere respuesta, programar procesamiento
            if (processingResult.requiresResponse) {
                // Por ahora solo registramos que necesita respuesta
                // Cuando tengamos el módulo de procesamiento, lo enviaremos ahí
                console.log('⏳ Mensaje programado para procesamiento');
            }

            return {
                saved: true,
                messageId: savedMessage.data._id,
                processing: processingResult
            };

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error.message);
            throw error;
        }
    }

    // Procesar webhook de WhatsApp API
    async processWebhook(webhookData) {
        console.log('🎯 Procesando webhook de WhatsApp API');

        try {
            // Extraer mensajes del webhook
            const entries = webhookData.entry || [];
            const results = [];

            for (const entry of entries) {
                const changes = entry.changes || [];
                
                for (const change of changes) {
                    if (change.field === 'messages') {
                        const value = change.value;
                        const messages = value.messages || [];

                        for (const message of messages) {
                            const processedMessage = await this.processApiMessage(message, value);
                            results.push(processedMessage);
                        }
                    }
                }
            }

            return { processed: results.length, results };

        } catch (error) {
            console.error('❌ Error procesando webhook:', error.message);
            throw error;
        }
    }

    // Procesar mensaje individual de la API
    async processApiMessage(message, context) {
        console.log('📱 Procesando mensaje de API:', {
            from: message.from,
            type: message.type
        });

        // Construir datos del mensaje
        const messageData = {
            messageId: message.id,
            from: message.from,
            to: context.metadata?.phone_number_id || 'system',
            body: this.extractMessageBody(message),
            type: message.type,
            direction: 'incoming',
            source: 'whatsapp-api',
            timestamp: new Date(parseInt(message.timestamp) * 1000)
        };

        // Guardar en base de datos
        const savedMessage = await this.moduleConnector.forwardRequest(
            'database',
            '/api/messages',
            'POST',
            messageData
        );

        // Validar si el usuario existe en el sistema
        const userValidation = await this.moduleConnector.forwardRequest(
            'database',
            `/api/users/validate/${message.from}`,
            'GET'
        );

        if (userValidation.valid) {
            console.log('✅ Usuario validado:', userValidation.data.nombre);
            
            // Es un comando de usuario (agente/gerente)
            return {
                type: 'user_command',
                messageId: savedMessage.data._id,
                user: userValidation.data,
                requiresBackendProcessing: true
            };
        } else {
            console.log('❌ Usuario no válido, ignorando mensaje');
            
            // No responder a usuarios no registrados
            return {
                type: 'invalid_user',
                messageId: savedMessage.data._id,
                requiresBackendProcessing: false
            };
        }
    }

    // Extraer contenido del mensaje según el tipo
    extractMessageBody(message) {
        switch (message.type) {
            case 'text':
                return message.text?.body || '';
            case 'image':
                return `[IMAGEN] ${message.image?.caption || ''}`;
            case 'video':
                return `[VIDEO] ${message.video?.caption || ''}`;
            case 'audio':
                return '[AUDIO]';
            case 'document':
                return `[DOCUMENTO] ${message.document?.filename || ''}`;
            default:
                return `[${message.type.toUpperCase()}]`;
        }
    }
}
module.exports = MessageDispatcher;