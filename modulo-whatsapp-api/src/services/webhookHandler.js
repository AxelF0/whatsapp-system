// servidor/modulo-whatsapp/whatsapp-api/src/services/webhookHandler.js

const axios = require('axios');

class WebhookHandler {
    constructor(whatsAppApiService) {
        this.apiService = whatsAppApiService;
        this.gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Cola de mensajes para procesar
        this.messageQueue = [];
        this.isProcessing = false;
        
        // Configurar listeners
        this.setupListeners();
    }

    // Configurar listeners para eventos de la API
    setupListeners() {
        // Listener para mensajes entrantes
        this.apiService.on('message', async (messageData) => {
            console.log('📨 Nuevo mensaje recibido:', {
                from: messageData.from,
                type: messageData.type,
                preview: messageData.body?.substring(0, 50)
            });

            // Agregar a la cola para procesar
            this.messageQueue.push(messageData);
            
            // Procesar cola si no está en proceso
            if (!this.isProcessing) {
                this.processQueue();
            }
        });

        // Listener para estados de mensajes
        this.apiService.on('message_status', (statusData) => {
            console.log('📊 Estado de mensaje actualizado:', statusData);
            // Aquí podrías actualizar el estado en la BD si lo necesitas
        });

        // Listener cuando la API está lista
        this.apiService.on('ready', (phoneInfo) => {
            console.log('🎉 API de WhatsApp lista:', phoneInfo);
        });
    }

    // Procesar cola de mensajes
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            
            try {
                await this.processMessage(message);
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error.message);
                // Podrías reintentar o guardar en una cola de errores
            }

            // Pequeña pausa entre mensajes
            await this.sleep(100);
        }

        this.isProcessing = false;
    }

    // Procesar mensaje individual
    async processMessage(messageData) {
        console.log('🔄 Procesando mensaje de:', messageData.from);

        try {
            // 1. Verificar si el remitente es un usuario registrado (agente/gerente)
            const userValidation = await this.validateUser(messageData.from);

            if (!userValidation.isValid) {
                console.log('❌ Usuario no registrado:', messageData.from);
                // No responder según tu lógica de negocio
                return {
                    processed: false,
                    reason: 'Usuario no registrado'
                };
            }

            console.log(`✅ Usuario validado: ${userValidation.user.nombre} (${userValidation.user.cargo_nombre})`);

            // 2. Preparar datos para el gateway
            const gatewayData = {
                id: messageData.id,
                from: messageData.from,
                to: messageData.to,
                body: messageData.body,
                type: messageData.type,
                timestamp: messageData.timestamp,
                source: 'whatsapp-api',
                userData: userValidation.user,
                messageType: 'system_command' // Los mensajes a la API son comandos del sistema
            };

            // 3. Enviar al gateway para procesamiento
            const gatewayResponse = await this.sendToGateway(gatewayData);

            console.log('✅ Mensaje procesado por el gateway:', gatewayResponse.data);

            // 4. Si el gateway responde con una respuesta inmediata, enviarla
            if (gatewayResponse.data?.immediateResponse) {
                await this.sendResponse(
                    messageData.from,
                    gatewayResponse.data.immediateResponse,
                    messageData.id
                );
            }

            return {
                processed: true,
                gatewayResponse: gatewayResponse.data
            };

        } catch (error) {
            console.error('❌ Error en processMessage:', error.message);
            
            // Enviar mensaje de error al usuario si está registrado
            if (messageData.from) {
                await this.sendErrorResponse(messageData.from, error.message);
            }
            
            throw error;
        }
    }

    // Validar si el usuario está registrado
    async validateUser(phoneNumber) {
        try {
            // Limpiar número
            const cleanPhone = this.cleanPhoneNumber(phoneNumber);
            
            console.log(`🔍 Validando usuario: ${cleanPhone}`);

            // Consultar a la base de datos
            const response = await axios.get(
                `${this.databaseUrl}/api/users/validate/${cleanPhone}`,
                {
                    timeout: 5000,
                    headers: {
                        'X-Source': 'whatsapp-api-webhook'
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
            console.error('❌ Error validando usuario:', error.message);
            
            // En caso de error, asumir que no es válido
            return {
                isValid: false,
                user: null,
                error: error.message
            };
        }
    }

    // Enviar al gateway
    async sendToGateway(messageData) {
        try {
            console.log('📤 Enviando al gateway...');

            const response = await axios.post(
                `${this.gatewayUrl}/api/whatsapp/webhook`,
                {
                    entry: [{
                        id: 'entry_' + Date.now(),
                        time: Date.now(),
                        changes: [{
                            field: 'messages',
                            value: {
                                messaging_product: 'whatsapp',
                                metadata: {
                                    display_phone_number: this.apiService.systemNumber,
                                    phone_number_id: this.apiService.phoneNumberId
                                },
                                messages: [messageData]
                            }
                        }]
                    }]
                },
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'whatsapp-api'
                    }
                }
            );

            return response;

        } catch (error) {
            console.error('❌ Error enviando al gateway:', error.message);
            throw new Error('Gateway no disponible');
        }
    }

    // Enviar respuesta al usuario
    async sendResponse(to, message, replyToId = null) {
        try {
            // Si el mensaje es muy largo, dividirlo
            const messages = this.splitLongMessage(message);

            for (const msg of messages) {
                await this.apiService.sendTextMessage(to, msg, replyToId);
                // Solo el primer mensaje es respuesta directa
                replyToId = null;
                
                // Pausa entre mensajes múltiples
                if (messages.length > 1) {
                    await this.sleep(500);
                }
            }

            return {
                success: true,
                messageCount: messages.length
            };

        } catch (error) {
            console.error('❌ Error enviando respuesta:', error.message);
            throw error;
        }
    }

    // Enviar respuesta de error
    async sendErrorResponse(to, errorMessage) {
        try {
            const message = `❌ Error procesando tu solicitud:\n\n${errorMessage}\n\n💡 Verifica el formato de tu comando o escribe "AYUDA" para ver los comandos disponibles.`;
            
            await this.apiService.sendTextMessage(to, message);

        } catch (error) {
            console.error('❌ Error enviando mensaje de error:', error.message);
        }
    }

    // Manejar webhook HTTP
    async handleWebhook(req, res) {
        // Verificación del webhook (GET)
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            try {
                const result = this.apiService.verifyWebhook(mode, token, challenge);
                return res.status(200).send(result);
            } catch (error) {
                return res.status(403).send('Forbidden');
            }
        }

        // Procesamiento de eventos (POST)
        if (req.method === 'POST') {
            try {
                console.log('🎯 Webhook recibido');
                
                // Procesar el webhook de forma asíncrona
                this.apiService.processWebhook(req.body).catch(error => {
                    console.error('❌ Error procesando webhook:', error.message);
                });

                // Responder inmediatamente a WhatsApp
                res.status(200).json({ status: 'received' });

            } catch (error) {
                console.error('❌ Error en webhook:', error.message);
                res.status(500).json({ error: error.message });
            }
        }
    }

    // Limpiar número de teléfono
    cleanPhoneNumber(phone) {
        // Eliminar caracteres no numéricos
        let cleaned = phone.replace(/\D/g, '');
        
        // Asegurar formato con código de país
        if (!cleaned.startsWith('591')) {
            cleaned = '591' + cleaned;
        }
        
        // Agregar + al inicio
        if (!cleaned.startsWith('+')) {
            cleaned = '+' + cleaned;
        }
        
        return cleaned;
    }

    // Dividir mensajes largos
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
                
                // Si una línea individual es muy larga, cortarla
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

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Obtener estadísticas
    getStats() {
        return {
            queueLength: this.messageQueue.length,
            isProcessing: this.isProcessing,
            gatewayUrl: this.gatewayUrl,
            databaseUrl: this.databaseUrl
        };
    }
}

module.exports = WebhookHandler;