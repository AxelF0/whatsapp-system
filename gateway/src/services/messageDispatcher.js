class MessageDispatcher {
    constructor(moduleConnector) {
        this.moduleConnector = moduleConnector;
    }

    // Procesar mensaje entrante de WhatsApp-Web.js
    async processIncomingMessage(messageData) {
        console.log('📨 Gateway procesando mensaje:', {
            from: messageData.from,
            to: messageData.to,
            body: messageData.body,
            source: messageData.source
        });

        try {
            // IMPORTANTE: Detectar si es un comando del sistema
            if (messageData.source === 'whatsapp-web' && messageData.body) {
                // Verificar si el remitente es un usuario del sistema
                try {
                    const validationResponse = await axios.get(
                        `${this.databaseUrl}/api/users/validate/${this.cleanPhoneNumber(messageData.from)}`,
                        { timeout: 5000 }
                    );

                    if (validationResponse.data.valid) {
                        console.log('✅ Es un usuario del sistema, ruteando como comando');

                        // Es un agente/gerente enviando comando
                        const processingRequest = {
                            ...messageData,
                            messageFlow: 'agent-to-system',
                            userData: validationResponse.data.data
                        };

                        const processingResult = await this.moduleConnector.forwardRequest(
                            'processing',
                            '/api/process/message',
                            'POST',
                            processingRequest
                        );

                        return {
                            saved: true,
                            processing: processingResult.data
                        };
                    }
                } catch (error) {
                    console.log('No es usuario del sistema, procesando como cliente');
                }
            }

            // Continuar con el flujo normal...
            // (resto del código existente)
        } catch (error) {
            console.error('❌ Error en gateway:', error.message);
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

        try {
            // Construir datos del mensaje
            const messageData = {
                messageId: message.id,
                from: message.from,
                to: context.metadata?.display_phone_number || context.metadata?.phone_number_id || 'system',
                body: this.extractMessageBody(message),
                type: this.mapApiType(message.type),
                direction: 'incoming',
                source: 'whatsapp-api',
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                processed: false,
                response_sent: false
            };

            // Fallback para garantizar body requerido por la BD
            if (!messageData.body) {
                messageData.body = '';
            }

            console.log('💾 Guardando mensaje de API en BD...');

            // Guardar en base de datos
            const savedMessage = await this.moduleConnector.forwardRequest(
                'database',
                '/api/messages',
                'POST',
                messageData
            );

            console.log('✅ Mensaje de API guardado:', savedMessage.data._id);

            // Enviar al módulo de procesamiento
            console.log('🧠 Enviando mensaje de API al procesamiento...');

            const processingRequest = {
                ...messageData,
                databaseId: savedMessage.data._id
            };

            const processingResult = await this.moduleConnector.forwardRequest(
                'processing',
                '/api/process/message',
                'POST',
                processingRequest
            );

            console.log('✅ Mensaje de API procesado:', processingResult.data.analysis.type);

            return {
                saved: true,
                messageId: savedMessage.data._id,
                processing: processingResult.data
            };

        } catch (error) {
            console.error('❌ Error procesando mensaje de API:', error.message);
            throw error;
        }
    }

    // Extraer contenido del mensaje según el tipo
    extractMessageBody(message) {
        // Soportar payloads del webhook nativo de Meta y payloads adaptados
        if (typeof message.body === 'string' && message.body.length > 0) {
            return message.body;
        }

        switch (message.type) {
            case 'text':
                return message.text?.body || message.body || '';
            case 'image':
                return `[IMAGEN] ${message.image?.caption || ''}`;
            case 'video':
                return `[VIDEO] ${message.video?.caption || ''}`;
            case 'audio':
                return '[AUDIO]';
            case 'document':
                return `[DOCUMENTO] ${message.document?.filename || ''}`;
            case 'interactive':
                if (message.interactive?.type === 'button_reply') {
                    return message.interactive?.button_reply?.title || '';
                }
                if (message.interactive?.type === 'list_reply') {
                    return message.interactive?.list_reply?.title || '';
                }
                return '[INTERACTIVE]';
            default:
                return message.body || `[${(message.type || 'unknown').toUpperCase()}]`;
        }
    }

    // Asegurar tipos válidos para el esquema de BD (text, image, video, audio, document)
    mapApiType(type) {
        const allowed = new Set(['text', 'image', 'video', 'audio', 'document']);
        if (allowed.has(type)) return type;
        // Mapear algunos conocidos
        if (type === 'sticker') return 'image';
        if (type === 'contacts') return 'document';
        if (type === 'interactive' || type === 'button' || type === 'reaction' || type === 'system') return 'text';
        return 'text';
    }

    // Manejar respuesta de procesamiento (para cuando se complete el flujo)
    async handleProcessingResponse(processingResponse) {
        console.log('📋 Manejando respuesta de procesamiento:', processingResponse.analysis.type);

        try {
            if (processingResponse.analysis.type === 'client_query') {
                console.log('👤 Procesamiento completado para consulta de cliente');
                // La respuesta se enviará automáticamente a través del módulo de respuestas

            } else if (processingResponse.analysis.type === 'system_command') {
                console.log('⚙️ Procesamiento completado para comando de sistema');
                // La respuesta se enviará automáticamente al usuario que envió el comando

            } else {
                console.log('ℹ️ Mensaje ignorado o no válido');
            }

            return {
                handled: true,
                type: processingResponse.analysis.type,
                processed: processingResponse.result.processed
            };

        } catch (error) {
            console.error('❌ Error manejando respuesta de procesamiento:', error.message);
            throw error;
        }
    }
}

module.exports = MessageDispatcher;