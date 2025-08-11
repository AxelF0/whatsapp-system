// servidor/modulo-whatsapp/src/services/whatsAppManager.js

class WhatsAppManager {
    constructor(alternativeSessionManager, messageHandler) {
        this.sessionManager = alternativeSessionManager;
        this.messageHandler = messageHandler;
    }

    // Crear nueva sesión de agente
    async createAgentSession(agentPhone, agentName) {
        console.log(`📱 Creando sesión de agente: ${agentName} (${agentPhone})`);

        try {
            // Validar formato de teléfono
            if (!this.messageHandler.validatePhoneNumber(agentPhone)) {
                throw new Error('Formato de teléfono inválido');
            }

            // Crear sesión
            const result = await this.sessionManager.createSession(agentPhone, agentName);
            
            console.log(`✅ Sesión creada exitosamente para ${agentName}`);
            
            return {
                ...result,
                message: 'Sesión creada. Escanea el código QR para conectar WhatsApp.'
            };

        } catch (error) {
            console.error(`❌ Error creando sesión para ${agentName}:`, error.message);
            throw error;
        }
    }

    // Enviar mensaje desde sesión de agente
    async sendMessage(agentPhone, messageData) {
        console.log(`📤 Enviando mensaje desde ${agentPhone}`);

        try {
            // Limpiar y validar contenido del mensaje
            messageData.message = this.messageHandler.cleanMessageContent(messageData.message);
            
            if (!messageData.message && !messageData.mediaUrl) {
                throw new Error('Mensaje o archivo multimedia requerido');
            }

            // Validar destinatario
            if (!this.messageHandler.validatePhoneNumber(messageData.to)) {
                throw new Error('Número de destinatario inválido');
            }

            // Enviar a través del session manager
            const result = await this.sessionManager.sendMessage(agentPhone, messageData);
            
            console.log(`✅ Mensaje enviado desde ${agentPhone} a ${messageData.to}`);
            
            return result;

        } catch (error) {
            console.error(`❌ Error enviando mensaje desde ${agentPhone}:`, error.message);
            throw error;
        }
    }

    // Cerrar sesión de agente
    async closeAgentSession(agentPhone) {
        console.log(`🛑 Cerrando sesión del agente ${agentPhone}`);

        try {
            await this.sessionManager.closeSession(agentPhone);
            console.log(`✅ Sesión cerrada: ${agentPhone}`);
            
            return {
                success: true,
                agentPhone,
                message: 'Sesión cerrada correctamente'
            };

        } catch (error) {
            console.error(`❌ Error cerrando sesión ${agentPhone}:`, error.message);
            throw error;
        }
    }

    // Obtener estado de todas las sesiones
    getSessionsStatus() {
        return this.sessionManager.getAllSessionsStatus();
    }

    // Cargar sesiones existentes (al iniciar el módulo)
    async loadExistingSessions() {
        console.log('🔄 Cargando sesiones existentes...');

        try {
            // Aquí podrías cargar sesiones desde una base de datos
            // Por ahora, iniciamos con sesiones vacías
            
            console.log('✅ Sesiones existentes cargadas');
            
            // Verificar conectividad con gateway
            const gatewayHealth = await this.messageHandler.checkGatewayHealth();
            if (gatewayHealth) {
                console.log('✅ Conectividad con Gateway verificada');
            } else {
                console.log('⚠️ Gateway no disponible al iniciar');
            }

        } catch (error) {
            console.error('❌ Error cargando sesiones existentes:', error.message);
            // No lanzar error aquí para permitir que el módulo inicie
        }
    }

    // Procesar respuesta automática del sistema
    async processSystemResponse(responseData) {
        console.log('🤖 Procesando respuesta automática del sistema');

        try {
            // Validar datos de respuesta
            const processedResponse = await this.messageHandler.processOutgoingResponse(responseData);
            
            if (processedResponse.readyToSend) {
                // Enviar la respuesta
                const result = await this.sendMessage(
                    responseData.agentPhone,
                    {
                        to: responseData.to,
                        message: responseData.message,
                        mediaUrl: responseData.mediaUrl,
                        mediaType: responseData.mediaType
                    }
                );
                
                console.log('✅ Respuesta automática enviada');
                return result;
            }

        } catch (error) {
            console.error('❌ Error procesando respuesta automática:', error.message);
            throw error;
        }
    }

    // Broadcast: enviar mensaje a múltiples destinatarios desde un agente
    async broadcastMessage(agentPhone, recipients, message, mediaData = null) {
        console.log(`📢 Broadcast desde ${agentPhone} a ${recipients.length} destinatarios`);

        const results = [];
        const errors = [];

        for (const recipient of recipients) {
            try {
                const result = await this.sendMessage(agentPhone, {
                    to: recipient,
                    message,
                    mediaUrl: mediaData?.mediaUrl,
                    mediaType: mediaData?.mediaType
                });

                results.push({ recipient, success: true, result });
                
                // Pequeña pausa entre envíos para evitar spam
                await this.sleep(1000);

            } catch (error) {
                console.error(`❌ Error enviando a ${recipient}:`, error.message);
                errors.push({ recipient, error: error.message });
            }
        }

        return {
            total: recipients.length,
            sent: results.length,
            failed: errors.length,
            results,
            errors
        };
    }

    // Obtener información del agente por su sesión
    getAgentInfo(agentPhone) {
        const sessions = this.sessionManager.getAllSessionsStatus();
        return sessions.find(session => session.agentPhone === agentPhone);
    }

    // Verificar si un agente está listo para enviar mensajes
    isAgentReady(agentPhone) {
        const agentInfo = this.getAgentInfo(agentPhone);
        return agentInfo && agentInfo.status === 'ready';
    }

    // Obtener agentes listos
    getReadyAgents() {
        return this.sessionManager.getAllSessionsStatus()
            .filter(session => session.status === 'ready');
    }

    // Reiniciar sesión de agente
    async restartAgentSession(agentPhone) {
        console.log(`🔄 Reiniciando sesión del agente ${agentPhone}`);

        try {
            const agentInfo = this.getAgentInfo(agentPhone);
            if (!agentInfo) {
                throw new Error('Agente no encontrado');
            }

            // Cerrar sesión actual
            await this.closeAgentSession(agentPhone);
            
            // Esperar un poco
            await this.sleep(2000);
            
            // Crear nueva sesión
            const result = await this.createAgentSession(agentPhone, agentInfo.agentName);
            
            console.log(`✅ Sesión reiniciada para ${agentPhone}`);
            return result;

        } catch (error) {
            console.error(`❌ Error reiniciando sesión ${agentPhone}:`, error.message);
            throw error;
        }
    }

    // Cerrar todas las sesiones
    async closeAllSessions() {
        console.log('🛑 Cerrando todas las sesiones...');
        await this.sessionManager.closeAllSessions();
    }

    // Obtener estadísticas del módulo
    getModuleStats() {
        const sessions = this.sessionManager.getAllSessionsStatus();
        
        return {
            totalSessions: sessions.length,
            readySessions: sessions.filter(s => s.status === 'ready').length,
            waitingSessions: sessions.filter(s => s.status === 'waiting_qr').length,
            disconnectedSessions: sessions.filter(s => s.status === 'disconnected').length,
            totalMessagesReceived: sessions.reduce((sum, s) => sum + (s.messagesReceived || 0), 0),
            totalMessagesSent: sessions.reduce((sum, s) => sum + (s.messagesSent || 0), 0),
            messageHandler: this.messageHandler.getStats()
        };
    }

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Verificar salud del módulo
    async healthCheck() {
        try {
            const gatewayHealth = await this.messageHandler.checkGatewayHealth();
            const stats = this.getModuleStats();
            
            return {
                status: 'healthy',
                gatewayConnected: gatewayHealth,
                sessions: stats,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = WhatsAppManager;