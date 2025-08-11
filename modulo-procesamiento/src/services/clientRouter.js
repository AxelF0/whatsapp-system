// servidor/modulo-procesamiento/src/services/clientRouter.js

const axios = require('axios');

class ClientRouter {
    constructor() {
        this.iaUrl = process.env.IA_URL || 'http://localhost:3003';
        this.responsesUrl = process.env.RESPONSES_URL || 'http://localhost:3005';
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        this.timeout = 30000; // 30 segundos para IA (puede ser lento)
    }

    // Rutear consulta de cliente a IA
    async routeToIA(messageData, analysis) {
        console.log('🤖 Ruteando consulta de cliente a IA:', {
            client: analysis.clientPhone,
            agent: analysis.agentPhone
        });

        try {
            // 1. Guardar/actualizar información del cliente
            await this.updateClientInfo(messageData, analysis);

            // 2. Preparar contexto para la IA
            const iaRequest = await this.prepareIARequest(messageData, analysis);

            // 3. Por ahora, simular respuesta de IA (ya que dijiste que la IA la manejas aparte)
            const simulatedResponse = await this.simulateIAResponse(iaRequest);

            // 4. Procesar la respuesta de IA
            const processedResponse = await this.processAIResponse(simulatedResponse);

            return {
                action: 'sent_to_ia',
                processed: true,
                iaRequest,
                iaResponse: simulatedResponse,
                finalResponse: processedResponse
            };

        } catch (error) {
            console.error('❌ Error ruteando a IA:', error.message);
            
            // En caso de error, enviar respuesta genérica
            return await this.sendErrorResponse(messageData, analysis, error.message);
        }
    }

    // Actualizar información del cliente en la base de datos
    async updateClientInfo(messageData, analysis) {
        console.log('💾 Actualizando información del cliente');

        try {
            const clientData = {
                telefono: this.cleanPhoneNumber(analysis.clientPhone),
                nombre: '', // Se actualizará cuando el cliente se presente
                apellido: '',
                preferencias: analysis.contentAnalysis?.intent || 'consulta_general',
                email: '',
                estado: 1
            };

            // Intentar crear o actualizar cliente
            await axios.post(`${this.databaseUrl}/api/clients`, clientData, {
                timeout: this.timeout,
                headers: { 'X-Source': 'processing-module' }
            });

            console.log('✅ Cliente actualizado en base de datos');

        } catch (error) {
            console.error('❌ Error actualizando cliente:', error.message);
            // No lanzar error aquí, continuar con el procesamiento
        }
    }

    // Preparar request para IA con contexto
    async prepareIARequest(messageData, analysis) {
        console.log('📋 Preparando request para IA');

        try {
            // Obtener historial de conversación
            const conversationHistory = await this.getConversationHistory(
                analysis.clientPhone, 
                analysis.agentPhone
            );

            // Obtener información del agente
            const agentInfo = await this.getAgentInfo(analysis.agentPhone);

            const iaRequest = {
                message: {
                    id: messageData.messageId || messageData.id,
                    from: analysis.clientPhone,
                    to: analysis.agentPhone,
                    body: messageData.body,
                    timestamp: messageData.timestamp
                },
                context: {
                    client: {
                        phone: analysis.clientPhone,
                        conversationHistory: conversationHistory?.messages || []
                    },
                    agent: {
                        phone: analysis.agentPhone,
                        name: agentInfo?.nombre || 'Agente',
                        role: agentInfo?.cargo_nombre || 'Agente Inmobiliario'
                    },
                    messageAnalysis: analysis.contentAnalysis,
                    timestamp: new Date().toISOString()
                }
            };

            return iaRequest;

        } catch (error) {
            console.error('❌ Error preparando request para IA:', error.message);
            
            // Request mínimo en caso de error
            return {
                message: {
                    body: messageData.body,
                    from: analysis.clientPhone
                },
                context: {
                    simple: true,
                    error: error.message
                }
            };
        }
    }

    // Simular respuesta de IA (temporal, hasta que conectes tu módulo de IA)
    async simulateIAResponse(iaRequest) {
        console.log('🎭 Simulando respuesta de IA (temporal)');

        // Esperar un poco para simular procesamiento
        await new Promise(resolve => setTimeout(resolve, 2000));

        const messageBody = iaRequest.message.body.toLowerCase();
        let response;

        if (messageBody.includes('hola') || messageBody.includes('buenas')) {
            response = {
                message: `¡Hola! Soy tu asistente inmobiliario virtual. ¿En qué puedo ayudarte hoy? Puedo ayudarte a encontrar propiedades, informarte sobre precios y ubicaciones.`,
                requiresFiles: false
            };
        } else if (messageBody.includes('casa') || messageBody.includes('departamento')) {
            response = {
                message: `Perfecto, te ayudo a encontrar propiedades. ¿Tienes alguna preferencia de ubicación o rango de precios? Por ejemplo, ¿qué zona te interesa y cuál es tu presupuesto aproximado?`,
                requiresFiles: false
            };
        } else if (messageBody.includes('precio') || messageBody.includes('costo')) {
            response = {
                message: `Te voy a mostrar algunas opciones que tenemos disponibles según tu presupuesto:

🏠 **Casa en Equipetrol** - 180,000 Bs
• 3 dormitorios, 2 baños
• 150 m² construidos
• Zona exclusiva

🏢 **Departamento Zona Norte** - 120,000 Bs  
• 2 dormitorios, 1 baño
• 80 m² construidos
• Cerca de centros comerciales

¿Te interesa alguna de estas opciones? Puedo enviarte más detalles y fotos.`,
                requiresFiles: true,
                suggestedProperties: [
                    { id: 1, name: 'Casa en Equipetrol' },
                    { id: 2, name: 'Departamento Zona Norte' }
                ]
            };
        } else {
            response = {
                message: `Gracias por tu consulta. Estoy aquí para ayudarte con información sobre propiedades inmobiliarias. 

Puedo ayudarte con:
• Búsqueda de casas y departamentos
• Información de precios
• Detalles de ubicaciones
• Características de propiedades

¿Qué tipo de propiedad estás buscando?`,
                requiresFiles: false
            };
        }

        return {
            success: true,
            response,
            processingTime: 2000,
            messageId: iaRequest.message.id
        };
    }

    // Procesar respuesta de IA y enviar al cliente
    async processAIResponse(iaResponse) {
        console.log('📤 Procesando respuesta de IA para envío');

        try {
            if (!iaResponse.success) {
                throw new Error('IA reportó error en procesamiento');
            }

            // Preparar datos para el módulo de respuestas
            const responseData = {
                to: iaResponse.messageId, // ID del mensaje original
                message: iaResponse.response.message,
                requiresFiles: iaResponse.response.requiresFiles || false,
                files: [],
                timestamp: new Date().toISOString()
            };

            // Si requiere archivos, obtenerlos
            if (iaResponse.response.requiresFiles && iaResponse.response.suggestedProperties) {
                responseData.files = await this.getPropertyFiles(iaResponse.response.suggestedProperties);
            }

            // Enviar al módulo de respuestas
            const sendResult = await this.sendToResponseModule(responseData);

            return {
                processed: true,
                sent: sendResult.success,
                responseData,
                sendResult
            };

        } catch (error) {
            console.error('❌ Error procesando respuesta de IA:', error.message);
            throw error;
        }
    }

    // Obtener archivos de propiedades sugeridas
    async getPropertyFiles(suggestedProperties) {
        console.log('📁 Obteniendo archivos de propiedades');

        const files = [];

        try {
            for (const property of suggestedProperties) {
                // Obtener detalles de la propiedad con archivos
                const propertyResponse = await axios.get(
                    `${this.databaseUrl}/api/properties/${property.id}`,
                    { timeout: this.timeout }
                );

                if (propertyResponse.data.success && propertyResponse.data.data.archivos) {
                    const propertyFiles = propertyResponse.data.data.archivos
                        .filter(archivo => archivo.tipo_archivo === 'image') // Solo imágenes por ahora
                        .slice(0, 3) // Máximo 3 imágenes por propiedad
                        .map(archivo => ({
                            url: archivo.url,
                            caption: `${property.name} - ${archivo.nombre_archivo}`,
                            type: 'image'
                        }));

                    files.push(...propertyFiles);
                }
            }

        } catch (error) {
            console.error('❌ Error obteniendo archivos de propiedades:', error.message);
            // Continuar sin archivos
        }

        return files;
    }

    // Enviar al módulo de respuestas
    async sendToResponseModule(responseData) {
        console.log('📡 Enviando al módulo de respuestas');

        try {
            // Por ahora simular el envío (hasta que tengas el módulo de respuestas)
            console.log('📤 Simulando envío de respuesta:');
            console.log('   Mensaje:', responseData.message.substring(0, 100) + '...');
            console.log('   Archivos:', responseData.files.length);

            return {
                success: true,
                sent: true,
                timestamp: new Date().toISOString()
            };

            // Cuando tengas el módulo de respuestas, descomenta esto:
            /*
            const response = await axios.post(`${this.responsesUrl}/api/send`, responseData, {
                timeout: this.timeout,
                headers: { 'X-Source': 'processing-module' }
            });

            return response.data;
            */

        } catch (error) {
            console.error('❌ Error enviando a módulo de respuestas:', error.message);
            throw error;
        }
    }

    // Obtener historial de conversación
    async getConversationHistory(clientPhone, agentPhone) {
        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/conversations/${this.cleanPhoneNumber(clientPhone)}/${this.cleanPhoneNumber(agentPhone)}`,
                { timeout: this.timeout }
            );

            return response.data.success ? response.data.data : null;

        } catch (error) {
            console.error('❌ Error obteniendo historial:', error.message);
            return null;
        }
    }

    // Obtener información del agente
    async getAgentInfo(agentPhone) {
        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/users/validate/${this.cleanPhoneNumber(agentPhone)}`,
                { timeout: this.timeout }
            );

            return response.data.valid ? response.data.data : null;

        } catch (error) {
            console.error('❌ Error obteniendo info del agente:', error.message);
            return null;
        }
    }

    // Enviar respuesta de error al cliente
    async sendErrorResponse(messageData, analysis, errorMessage) {
        console.log('⚠️ Enviando respuesta de error');

        const errorResponseData = {
            to: analysis.clientPhone,
            agentPhone: analysis.agentPhone,
            message: 'Disculpa, tengo problemas técnicos en este momento. Un agente te contactará pronto. ¡Gracias por tu paciencia!',
            requiresFiles: false,
            timestamp: new Date().toISOString(),
            error: true,
            originalError: errorMessage
        };

        try {
            await this.sendToResponseModule(errorResponseData);
            
            return {
                action: 'error_response_sent',
                processed: true,
                error: errorMessage,
                errorResponse: errorResponseData
            };

        } catch (sendError) {
            console.error('❌ Error enviando respuesta de error:', sendError.message);
            
            return {
                action: 'failed_to_respond',
                processed: false,
                error: errorMessage,
                sendError: sendError.message
            };
        }
    }

    // Limpiar número de teléfono
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        return phoneNumber.replace('@c.us', '').replace(/[^\d+]/g, '');
    }

    // Obtener estadísticas del router
    getStats() {
        return {
            iaUrl: this.iaUrl,
            responsesUrl: this.responsesUrl,
            databaseUrl: this.databaseUrl,
            timeout: this.timeout
        };
    }

    // Verificar conectividad con servicios
    async checkConnectivity() {
        const results = {};

        // Verificar base de datos
        try {
            const response = await axios.get(`${this.databaseUrl}/api/health`, { timeout: 5000 });
            results.database = response.data.success;
        } catch (error) {
            results.database = false;
        }

        // Verificar módulo de respuestas (cuando esté listo)
        results.responses = false; // Por ahora false hasta que esté implementado

        // Verificar IA (cuando esté listo)  
        results.ia = false; // Por ahora false hasta que esté implementado

        return results;
    }
}

module.exports = ClientRouter;