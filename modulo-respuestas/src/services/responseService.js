// servidor/modulo-respuestas/src/services/responseService.js

const axios = require('axios');

class ResponseService {
    constructor(whatsAppConnector, fileService, templateService) {
        this.whatsAppConnector = whatsAppConnector;
        this.fileService = fileService;
        this.templateService = templateService;
        
        // Cola de mensajes para reintentos
        this.messageQueue = [];
        this.failedMessages = new Map();
        
        // Control de procesamiento de cola
        this.isProcessingQueue = false;
        this.shouldStopProcessing = false;
        
        // Estadísticas
        this.stats = {
            totalSent: 0,
            totalFailed: 0,
            clientMessages: 0,
            systemMessages: 0,
            broadcastMessages: 0,
            retries: 0
        };
    }
    
    // Guardar mensaje en base de datos
    async saveMessageToDB(messageData) {
        try {
            const response = await axios.post(
                `${process.env.DATABASE_URL || 'http://localhost:3006'}/api/messages`,
                {
                    messageId: messageData.messageId,
                    from: messageData.agentPhone || 'system',
                    to: messageData.to,
                    body: messageData.message,
                    type: messageData.mediaFiles ? 'media' : 'text',
                    direction: 'outgoing',
                    source: messageData.source || 'response-module',
                    processed: true,
                    response_sent: true,
                    timestamp: messageData.sentAt || new Date()
                },
                { timeout: 5000 }
            );

            return response.data;
        } catch (error) {
            console.error('⚠️ Error guardando en BD:', error.message);
            // No lanzar error para no interrumpir el envío
            return null;
        }
    }

    // Obtener estado de la cola
    getQueueStatus() {
        return {
            pending: this.messageQueue.length,
            failed: this.failedMessages.size,
            isProcessing: this.isProcessingQueue,
            queue: this.messageQueue.map(item => ({
                id: item.id,
                attempts: item.attempts,
                maxAttempts: item.maxAttempts,
                nextRetry: item.nextRetry,
                error: item.error
            })),
            failedMessages: Array.from(this.failedMessages.entries()).map(([id, data]) => ({
                id,
                attempts: data.attempts,
                error: data.finalError,
                failedAt: data.failedAt
            }))
        };
    }

    // Obtener estadísticas
    async getStats() {
        return {
            ...this.stats,
            queueStatus: this.getQueueStatus(),
            timestamp: new Date().toISOString()
        };
    }

    // Verificar salud del servicio
    async checkHealth() {
        const health = {
            whatsapp: false,
            gateway: false,
            database: false,
            allConnected: false
        };

        // Verificar WhatsApp
        try {
            const response = await axios.get(
                `${process.env.WHATSAPP_URL || 'http://localhost:3001'}/api/health`,
                { timeout: 5000 }
            );
            health.whatsapp = response.data.success === true;
        } catch (error) {
            console.error('⚠️ WhatsApp no disponible');
        }

        // Verificar Gateway
        try {
            const response = await axios.get(
                `${process.env.GATEWAY_URL || 'http://localhost:3000'}/api/health`,
                { timeout: 5000 }
            );
            health.gateway = response.data.success === true;
        } catch (error) {
            console.error('⚠️ Gateway no disponible');
        }

        // Verificar Base de datos
        try {
            const response = await axios.get(
                `${process.env.DATABASE_URL || 'http://localhost:3006'}/api/health`,
                { timeout: 5000 }
            );
            health.database = response.data.success === true;
        } catch (error) {
            console.error('⚠️ Base de datos no disponible');
        }

        health.allConnected = health.whatsapp && health.gateway && health.database;

        return health;
    }

    // Helper para sleep con posibilidad de cancelación
    sleep(ms) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.shouldStopProcessing) {
                    reject(new Error('Procesamiento cancelado'));
                } else {
                    resolve();
                }
            }, ms);

            // Si se solicita parar, cancelar el timeout
            if (this.shouldStopProcessing) {
                clearTimeout(timeout);
                reject(new Error('Procesamiento cancelado'));
            }
        });
    }

    // Detener procesamiento de la cola
    stopProcessing() {
        console.log('🛑 Deteniendo procesamiento de la cola...');
        this.shouldStopProcessing = true;
    }

    // Limpiar recursos al cerrar
    async shutdown() {
        console.log('🛑 Cerrando servicio de respuestas...');
        
        // Detener procesamiento
        this.stopProcessing();
        
        // Esperar un poco para que termine el procesamiento actual
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Intentar procesar cola pendiente una última vez (con límite)
        if (this.messageQueue.length > 0) {
            console.log(`⏳ Procesando ${this.messageQueue.length} mensajes pendientes...`);
            
            // Procesar máximo 10 mensajes o 30 segundos
            const maxProcessTime = 30000; // 30 segundos
            const startTime = Date.now();
            
            this.shouldStopProcessing = false;
            
            try {
                await Promise.race([
                    this.processQueueWithLimit(10),
                    new Promise(resolve => setTimeout(resolve, maxProcessTime))
                ]);
            } catch (error) {
                console.error('⚠️ Error en procesamiento final:', error.message);
            }
        }

        // Guardar estado de mensajes fallidos (podrías guardarlos en BD)
        if (this.failedMessages.size > 0) {
            console.log(`💾 ${this.failedMessages.size} mensajes fallidos para recuperar`);
        }

        console.log('✅ Servicio de respuestas cerrado');
    }

    // Enviar respuesta genérica (determina automáticamente el tipo)
    async sendResponse(responseData) {
        console.log('📤 Procesando respuesta:', {
            to: responseData.to,
            source: responseData.source,
            hasTemplate: !!responseData.templateId
        });

        try {
            // Determinar tipo de respuesta basado en la fuente y tipo
            if (responseData.source === 'processing-module') {
                // Los mensajes del módulo de procesamiento son respuestas del sistema
                return await this.sendSystemResponse(responseData);
            } else if (responseData.source === 'ia' || responseData.responseType === 'client') {
                return await this.sendToClient(responseData);
            } else if (responseData.source === 'backend' || responseData.responseType === 'system') {
                return await this.sendSystemResponse(responseData);
            } else {
                throw new Error('Tipo de respuesta no especificado');
            }
        } catch (error) {
            console.error('❌ Error enviando respuesta:', error.message);
            
            // Solo agregar a cola si no es un error crítico
            if (!this.shouldStopProcessing) {
                await this.addToQueue(responseData, error.message);
            }
            throw error;
        }
    }

    // Enviar respuesta a cliente (vía WhatsApp-Web)
    async sendToClient(responseData) {
        console.log('👤 Enviando respuesta a cliente:', responseData.to);

        try {
            // Validar datos requeridos
            if (!responseData.to || !responseData.agentPhone) {
                throw new Error('Destinatario y teléfono del agente requeridos');
            }

            // Renderizar plantilla si existe
            let message = responseData.message;
            if (responseData.templateId) {
                const rendered = await this.templateService.renderTemplate(
                    responseData.templateId,
                    responseData.templateData || {}
                );
                message = rendered.content;
            }

            // Preparar archivos multimedia si existen
            let mediaFiles = [];
            if (responseData.files && responseData.files.length > 0) {
                mediaFiles = await this.prepareMediaFiles(responseData.files);
            }

            // Enviar a través de WhatsApp-Web
            const result = await this.whatsAppConnector.sendViaWhatsAppWeb({
                agentPhone: responseData.agentPhone,
                to: responseData.to,
                message: message,
                mediaFiles: mediaFiles
            });

            // Actualizar estadísticas
            this.stats.totalSent++;
            this.stats.clientMessages++;

            // Guardar en base de datos
            await this.saveMessageToDB({
                ...responseData,
                status: 'sent',
                sentAt: new Date(),
                messageId: result.messageId
            });

            console.log('✅ Respuesta enviada a cliente');

            return {
                success: true,
                messageId: result.messageId,
                timestamp: new Date(),
                to: responseData.to,
                agentPhone: responseData.agentPhone
            };
        } catch (error) {
            console.error('❌ Error enviando a cliente:', error.message);
            
            this.stats.totalFailed++;
            this.stats.clientMessages++;
            
            throw error;
        }
    }

    async sendSystemResponse(responseData) {
        console.log('🏢 Enviando respuesta del sistema a:', responseData.to);

        try {
            if (!responseData.message) {
                throw new Error('Mensaje requerido para respuesta del sistema');
            }

            // ENVÍO REAL por WhatsApp
            const whatsappResponse = await axios.post(
                'http://localhost:3001/api/system/send',
                {
                    to: responseData.to.replace('@c.us', '').replace('+', ''),
                    message: responseData.message,
                    type: responseData.type || 'text',
                    message: responseData.message,
                message: responseData.message
            },
            { timeout: 30000 }
        );

        console.log('✅ Respuesta del sistema enviada por WhatsApp');

        return {
            success: true,
            messageId: whatsappResponse.data.data?.messageId || `msg_${Date.now()}`,
            timestamp: new Date()
        };

    } catch (error) {
        console.error('❌ Error enviando respuesta del sistema:', error.message);
        throw error;
    }
}

    // Enviar broadcast
    async sendBroadcast(broadcastData) {
        console.log(`📢 Iniciando broadcast a ${broadcastData.recipients.length} destinatarios`);

        const results = {
            total: broadcastData.recipients.length,
            sent: 0,
            failed: 0,
            details: []
        };

        // Renderizar mensaje si usa plantilla
        let message = broadcastData.message;
        if (broadcastData.templateId) {
            const rendered = await this.templateService.renderTemplate(
                broadcastData.templateId,
                broadcastData.templateData || {}
            );
            message = rendered.content;
        }

        // Preparar archivos multimedia
        let mediaFiles = [];
        if (broadcastData.mediaFiles && broadcastData.mediaFiles.length > 0) {
            mediaFiles = await this.prepareMediaFiles(broadcastData.mediaFiles);
        }

        // Enviar a cada destinatario
        for (const recipient of broadcastData.recipients) {
            try {
                const result = await this.sendResponse({
                    to: recipient.phone,
                    agentPhone: recipient.agentPhone || broadcastData.defaultAgentPhone,
                    message: message,
                    files: mediaFiles,
                    responseType: recipient.type || 'client',
                    isBroadcast: true
                });

                results.sent++;
                results.details.push({
                    recipient: recipient.phone,
                    success: true,
                    messageId: result.messageId
                });

                // Pequeña pausa entre envíos
                await this.sleep(500);
            } catch (error) {
                results.failed++;
                results.details.push({
                    recipient: recipient.phone,
                    success: false,
                    error: error.message
                });
            }
        }

        // Actualizar estadísticas
        this.stats.broadcastMessages += results.total;

        console.log(`✅ Broadcast completado: ${results.sent}/${results.total} enviados`);

        return results;
    }

    // Preparar archivos multimedia
    async prepareMediaFiles(files) {
        const preparedFiles = [];

        for (const file of files) {
            try {
                let fileData;

                if (typeof file === 'string') {
                    // Es una URL o path
                    fileData = await this.fileService.getFileFromPath(file);
                } else if (file.id) {
                    // Es un ID de archivo
                    fileData = await this.fileService.getFile(file.id);
                } else {
                    // Es un objeto con datos del archivo
                    fileData = file;
                }

                preparedFiles.push(fileData);
            } catch (error) {
                console.error('❌ Error procesando archivo multimedia:', error.message);
                // Continuar con el siguiente archivo
            }
        }

        return preparedFiles;
    }

    // Agregar mensaje a la cola de reintentos
    async addToQueue(messageData, error) {
        const messageId = messageData.messageId || `msg_${Date.now()}`;
        const maxAttempts = messageData.maxAttempts || 3;
        const retryDelay = messageData.retryDelay || 5000; // 5 segundos

        const queueItem = {
            id: messageId,
            data: messageData,
            attempts: 1,
            maxAttempts: maxAttempts,
            nextRetry: Date.now() + retryDelay,
            error: error.toString()
        };

        this.messageQueue.push(queueItem);
        console.log(`⏳ Mensaje ${messageId} agregado a la cola de reintentos (intento 1/${maxAttempts})`);

        // Iniciar procesamiento de la cola si no está en curso
        if (!this.isProcessingQueue) {
            this.processQueue().catch(err => {
                console.error('❌ Error en procesamiento de cola:', err.message);
            });
        }
    }

    // Procesar la cola de mensajes pendientes con límites
    async processQueue() {
        if (this.isProcessingQueue) {
            console.log('⚠️ Ya hay un proceso de cola en ejecución');
            return;
        }

        this.isProcessingQueue = true;
        this.shouldStopProcessing = false;
        
        console.log('🚀 Iniciando procesamiento de cola...');

        try {
            let consecutiveErrors = 0;
            const maxConsecutiveErrors = 5;
            const maxTotalTime = 300000; // 5 minutos máximo
            const startTime = Date.now();

            while (this.messageQueue.length > 0 && !this.shouldStopProcessing) {
                // Verificar tiempo límite
                if (Date.now() - startTime > maxTotalTime) {
                    console.log('⏰ Tiempo límite de procesamiento alcanzado');
                    break;
                }

                // Verificar errores consecutivos
                if (consecutiveErrors >= maxConsecutiveErrors) {
                    console.log('❌ Demasiados errores consecutivos, pausando procesamiento');
                    break;
                }

                const now = Date.now();
                const queueItem = this.messageQueue[0];

                // Si aún no es tiempo de reintentar, esperar o pasar al siguiente
                if (queueItem.nextRetry > now) {
                    const waitTime = Math.min(queueItem.nextRetry - now, 10000); // máximo 10 segundos
                    console.log(`⏳ Esperando ${waitTime}ms para reintentar mensaje ${queueItem.id}`);
                    
                    try {
                        await this.sleep(waitTime);
                    } catch (error) {
                        // Cancelado por shutdown
                        break;
                    }
                    continue;
                }

                try {
                    console.log(`🔄 Reintentando mensaje ${queueItem.id} (${queueItem.attempts}/${queueItem.maxAttempts})`);
                    
                    // Reintentar el envío
                    await this.sendResponse(queueItem.data);
                    
                    // Si tiene éxito, remover de la cola
                    this.messageQueue.shift();
                    consecutiveErrors = 0; // Reset contador de errores
                    this.stats.retries++;
                    
                    console.log(`✅ Reintento exitoso para mensaje ${queueItem.id}`);
                    
                } catch (error) {
                    consecutiveErrors++;
                    console.error(`❌ Error en reintento ${queueItem.attempts} para mensaje ${queueItem.id}:`, error.message);
                    
                    // Si se agotaron los intentos, mover a fallidos
                    if (queueItem.attempts >= queueItem.maxAttempts) {
                        const failedItem = this.messageQueue.shift();
                        this.failedMessages.set(failedItem.id, {
                            data: failedItem.data,
                            attempts: failedItem.attempts,
                            finalError: error.message,
                            failedAt: new Date()
                        });
                        
                        console.error(`❌ Mensaje ${queueItem.id} movido a fallidos después de ${queueItem.attempts} intentos`);
                        
                        // Actualizar estadísticas
                        this.stats.totalFailed++;
                        
                    } else {
                        // Programar siguiente reintento con backoff exponencial
                        const baseDelay = queueItem.data.retryDelay || 5000;
                        const nextDelay = Math.min(
                            baseDelay * Math.pow(2, queueItem.attempts - 1),
                            300000 // 5 minutos máximo
                        );
                        
                        queueItem.attempts++;
                        queueItem.nextRetry = Date.now() + nextDelay;
                        queueItem.error = error.message;
                        
                        console.log(`⏳ Programado reintento ${queueItem.attempts} para mensaje ${queueItem.id} en ${nextDelay}ms`);
                        
                        // Mover al final de la cola
                        this.messageQueue.shift();
                        this.messageQueue.push(queueItem);
                    }
                }

                // Pequeña pausa entre procesamiento de mensajes
                if (this.messageQueue.length > 0) {
                    try {
                        await this.sleep(1000);
                    } catch (error) {
                        // Cancelado por shutdown
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error crítico en procesamiento de cola:', error.message);
        } finally {
            this.isProcessingQueue = false;
            console.log('🏁 Procesamiento de cola finalizado');
        }
    }

    // Procesar cola con límite de mensajes (para shutdown)
    async processQueueWithLimit(maxMessages) {
        let processed = 0;
        
        while (this.messageQueue.length > 0 && processed < maxMessages && !this.shouldStopProcessing) {
            const queueItem = this.messageQueue[0];
            
            try {
                await this.sendResponse(queueItem.data);
                this.messageQueue.shift();
                processed++;
                console.log(`✅ Procesado mensaje ${queueItem.id} (${processed}/${maxMessages})`);
            } catch (error) {
                // Mover a fallidos
                const failedItem = this.messageQueue.shift();
                this.failedMessages.set(failedItem.id, {
                    data: failedItem.data,
                    attempts: failedItem.attempts,
                    finalError: error.message,
                    failedAt: new Date()
                });
                processed++;
            }

            // Pequeña pausa
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return processed;
    }

    // Reintentar mensajes fallidos
    async retryFailedMessages(messageIds = []) {
        const results = {
            total: messageIds.length || this.failedMessages.size,
            retried: 0,
            notFound: 0,
            details: []
        };

        // Si no se especifican IDs, intentar todos los fallidos
        const idsToRetry = messageIds.length > 0 
            ? messageIds.filter(id => this.failedMessages.has(id))
            : Array.from(this.failedMessages.keys());

        results.total = idsToRetry.length;

        for (const id of idsToRetry) {
            const failedMessage = this.failedMessages.get(id);
            
            try {
                // Agregar a la cola de reintentos
                await this.addToQueue({
                    ...failedMessage.data,
                    messageId: id,
                    maxAttempts: 3, // Nuevo límite de intentos
                    retryDelay: 10000 // 10 segundos entre reintentos
                });
                
                // Eliminar de fallidos
                this.failedMessages.delete(id);
                
                results.retried++;
                results.details.push({
                    id,
                    status: 'retried',
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error(`❌ Error al reintentar mensaje ${id}:`, error.message);
                
                results.notFound++;
                results.details.push({
                    id,
                    status: 'error',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }

        return results;
    }
}

module.exports = ResponseService;