// servidor/modulo-procesamiento/src/services/systemRouter.js

const axios = require('axios');

class SystemRouter {
    constructor() {
        this.backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3004';
        this.responsesUrl = process.env.RESPONSES_URL || 'http://127.0.0.1:3005';
        this.iaUrl = process.env.IA_URL || 'http://127.0.0.1:3007';
        this.timeout = 10000; // 10 segundos - optimizado para WhatsApp
        this.maxRetries = 2;    // Menos reintentos, más rápido
        this.retryDelay = 500;  // Delay más corto entre reintentos
        // Cache para evitar envíos duplicados
        this.sentMessages = new Map();
    }

    // Limpiar número de teléfono
    cleanPhoneNumber(phone) {
        if (!phone) return '';
        // Eliminar caracteres no numéricos y @c.us
        return phone.replace(/\D/g, '').replace('@c.us', '');
    }

    // Enviar respuesta al módulo de respuestas
    async sendToResponses(responseData, attempt = 1) {
        try {
            console.log('📨 Enviando respuesta al módulo de respuestas:', {
                to: responseData.to,
                type: responseData.type,
                message: responseData.message?.substring(0, 50) + '...'
            });

            // Formatear el mensaje para el módulo de respuestas
            const formattedResponse = {
                to: responseData.to,
                message: responseData.message,
                responseType: responseData.type || 'text',
                type: responseData.type || 'text',
                metadata: responseData.metadata || {},
                source: 'processing-module'
            };

            console.log(`📡 Enviando a: ${this.responsesUrl}/api/send`);
            const response = await axios.post(
                `${this.responsesUrl}/api/send`,
                formattedResponse,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'processing-module'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error(`❌ Error enviando respuesta (intento ${attempt}):`, error.message);

            if (attempt < this.maxRetries) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms... (${attempt}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendToResponses(responseData, attempt + 1);
            }

            throw new Error(`No se pudo enviar la respuesta después de ${this.maxRetries} intentos`);
        }
    }

    // Rutear comando de sistema al backend (Opción 3 - Backend maneja todo)
    async routeToBackend(messageData, analysis) {
        console.log('⚙️ Procesando entrada del sistema:', {
            user: analysis.userData.nombre,
            message: messageData.body
        });

        try {
            // Enviar todo al Backend para que procese con su MenuManager
            const backendRequest = {
                messageData: {
                    body: messageData.body,
                    messageId: messageData.messageId
                },
                user: {
                    phone: analysis.userPhone,
                    name: analysis.userData.nombre,
                    role: analysis.userData.cargo_nombre,
                    id: analysis.userData.id,
                    userData: analysis.userData
                },
                timestamp: new Date().toISOString(),
                source: 'processing-module'
            };

            // Enviar al backend para procesamiento completo
            console.log(`📡 Enviando al Backend: ${this.backendUrl}/api/system/process`);
            const backendResponse = await axios.post(
                `${this.backendUrl}/api/system/process`,
                backendRequest,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'processing-module'
                    }
                }
            );

            // El Backend procesa todo y envía directamente al módulo de Respuestas
            if (backendResponse.data && backendResponse.data.success && backendResponse.data.processed) {
                console.log('✅ Backend procesó y envió respuesta al usuario');
                
                return {
                    action: 'backend_processed',
                    processed: true,
                    message: backendResponse.data.message || 'Mensaje procesado por Backend'
                };
            }

            return {
                action: 'no_response_from_backend',
                processed: false,
                error: 'Backend no devolvió respuesta válida'
            };

        } catch (error) {
            console.error('❌ Error comunicándose con Backend:', error.message);
            
            // Error de conectividad con el backend
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                await this.sendToResponses({
                    to: analysis.userPhone,
                    message: '⚠️ El sistema está temporalmente no disponible. Intenta de nuevo en unos momentos.',
                    type: 'text',
                    metadata: {
                        messageId: messageData.messageId,
                        userId: analysis.userData.id,
                        error: 'backend_connection_error'
                    }
                });
                
                return {
                    action: 'connection_error',
                    processed: true,
                    error: error.message
                };
            }
            
            // Otros errores del backend
            await this.sendToResponses({
                to: analysis.userPhone,
                message: '❌ Error procesando tu solicitud. Por favor intenta de nuevo.',
                type: 'text',
                metadata: {
                    messageId: messageData.messageId,
                    userId: analysis.userData.id,
                    error: 'backend_processing_error'
                }
            });

            return {
                action: 'backend_error',
                processed: true,
                error: error.message
            };
        }
    }

    // Agregar método para combinar respuestas
    combineResponses(menuResult, backendResponse) {
        let finalMessage = '';

        if (backendResponse && backendResponse.message) {
            finalMessage = backendResponse.message;
        }

        if (menuResult.showMenu) {
            finalMessage += '\n\n' + menuResult.message;
        }

        return finalMessage || menuResult.message;
    }

    // Agregar método para enviar al backend real
    async sendToBackend(backendRequest) {
        try {
            const response = await axios.post(
                `${this.backendUrl}/api/command`,
                backendRequest,
                { timeout: this.timeout }
            );

            return response.data;
        } catch (error) {
            console.error('❌ Error comunicando con backend:', error.message);
            throw error;
        }
    }

    // Validar permisos del usuario para ejecutar comandos
    async validateCommandPermissions(analysis) {
        const commandType = analysis.contentAnalysis?.commandType;
        const userRole = analysis.userData.cargo_nombre?.toLowerCase();

        console.log(`🔐 Validando permisos: ${userRole} -> ${commandType}`);

        // Definir permisos por rol y comando
        const permissions = {
            'gerente': {
                'create_property': true,
                'update_property': true,
                'delete_property': true,
                'create_client': true,
                'create_agent': true,
                'update_agent': true,
                'list_data': true,
                'help': true
            },
            'agente': {
                'create_property': true,
                'update_property': true,
                'delete_property': false, // Solo gerentes pueden eliminar
                'create_client': true,
                'create_agent': false, // Solo gerentes pueden crear agentes
                'update_agent': false,
                'list_data': true,
                'help': true
            }
        };

        const userPermissions = permissions[userRole] || {};
        const hasPermission = userPermissions[commandType] === true;

        if (!hasPermission) {
            let reason = 'Comando no reconocido';

            if (commandType && userPermissions[commandType] === false) {
                reason = `Los ${userRole}s no tienen permisos para: ${commandType}`;
            } else if (!commandType) {
                reason = 'Comando no válido o no reconocido';
            }

            return { hasPermission: false, reason };
        }

        return { hasPermission: true };
    }

    async processSystemMessage(messageData, analysis) {
        console.log('🔧 Procesando mensaje del sistema');

        try {
            // Procesar con el menú
            const menuResult = await this.menuManager.processInput(
                analysis.userData.id,
                analysis.userData.cargo_nombre,
                messageData.body,
                analysis.userData
            );

            // Determinar respuesta única
            let responseMessage = null;

            // Si hay comando para ejecutar, priorizarlo sobre el mensaje del menú
            if (menuResult.executeCommand) {
                console.log('🔄 Ejecutando comando en backend...');
                try {
                    const backendRequest = {
                        command: menuResult.executeCommand,
                        user: {
                            phone: analysis.userPhone,
                            name: analysis.userData.nombre,
                            role: analysis.userData.cargo_nombre,
                            id: analysis.userData.id
                        }
                    };

                    // Ejecutar en backend
                    const backendResponse = await axios.post(
                        `${this.backendUrl}/api/command`,
                        backendRequest,
                        { timeout: this.timeout }
                    );

                    if (backendResponse.data.success) {
                        responseMessage = backendResponse.data.message || backendResponse.data.data?.message;
                        console.log('✅ Respuesta recibida del backend para enviar al usuario');
                    } else {
                        responseMessage = backendResponse.data.error || 'Error procesando comando';
                        console.log('❌ Error recibido del backend:', responseMessage);
                    }
                } catch (error) {
                    console.error('❌ Error ejecutando comando:', error.message);
                    responseMessage = `❌ Error: ${error.message}`;
                }
            } else {
                // Si no hay comando, usar el mensaje del menú
                responseMessage = menuResult.message;
                console.log('📝 Usando mensaje del menú (sin comando backend)');
            }

            // Enviar respuesta real al usuario solo si hay mensaje
            if (responseMessage) {
                await this.sendResponseToUser(analysis.userPhone, responseMessage);
            }

            return {
                action: responseMessage ? 'response_sent' : 'error_handled_by_backend',
                processed: true,
                message: responseMessage || 'Error manejado por el backend'
            };

        } catch (error) {
            console.error('❌ Error procesando mensaje del sistema:', error.message);
            throw error;
        }
    }

    // Agregar método para enviar respuesta
    async sendResponseToUser(userPhone, message) {
        try {
            // Limpiar número
            const cleanPhone = userPhone.replace('@c.us', '').replace(/[^\d]/g, '');

            // Enviar vía módulo de respuestas
            const response = await axios.post(
                `${this.responsesUrl}/api/send/system`,
                {
                    to: cleanPhone,
                    message: message,
                    responseType: 'system'
                },
                { timeout: 8000 }
            );

            console.log('✅ Respuesta enviada al usuario vía WhatsApp');
            return response.data;

        } catch (error) {
            console.error('❌ Error enviando respuesta:', error.message);
            throw error;
        }
    }
    // Preparar request para backend
    prepareBackendRequest(messageData, analysis) {
        console.log('📋 Preparando request para backend');

        const baseRequest = {
            command: {
                type: analysis.contentAnalysis?.commandType,
                originalMessage: messageData.body,
                parameters: this.extractCommandParameters(messageData.body, analysis.contentAnalysis?.commandType)
            },
            user: {
                phone: analysis.userPhone,
                name: analysis.userData.nombre,
                role: analysis.userData.cargo_nombre,
                id: analysis.userData.id
            },
            timestamp: new Date().toISOString(),
            messageId: messageData.messageId || messageData.id
        };

        return baseRequest;
    }

    // Extraer parámetros del comando según el tipo
    extractCommandParameters(messageBody, commandType) {
        console.log(`📝 Extrayendo parámetros para: ${commandType}`);

        const parameters = {};
        const upperBody = messageBody.toUpperCase();

        switch (commandType) {
            case 'create_property':
                parameters.propertyData = this.parsePropertyCommand(messageBody);
                break;

            case 'update_property':
                parameters.propertyId = this.extractPropertyId(messageBody);
                parameters.updateData = this.parsePropertyCommand(messageBody);
                break;

            case 'delete_property':
                parameters.propertyId = this.extractPropertyId(messageBody);
                break;

            case 'create_client':
                parameters.clientData = this.parseClientCommand(messageBody);
                break;

            case 'create_agent':
                parameters.agentData = this.parseAgentCommand(messageBody);
                break;

            case 'list_data':
                parameters.listType = this.extractListType(messageBody);
                parameters.filters = this.extractFilters(messageBody);
                break;

            case 'help':
                parameters.topic = this.extractHelpTopic(messageBody);
                break;

            default:
                parameters.raw = messageBody;
        }

        return parameters;
    }

    // Parsear comando de crear propiedad
    parsePropertyCommand(messageBody) {
        // Ejemplo: "NUEVA PROPIEDAD Casa en Equipetrol 150000 BS 3 dormitorios 2 baños"
        const propertyData = {
            nombre_propiedad: '',
            ubicacion: '',
            precio: 0,
            dormitorios: 0,
            banos: 0,
            descripcion: messageBody
        };

        // Extraer precio (números seguidos de BS, bolivianos, etc.)
        const priceMatch = messageBody.match(/(\d+)\s*(bs|bolivianos?)/i);
        if (priceMatch) {
            propertyData.precio = parseInt(priceMatch[1]);
        }

        // Extraer dormitorios
        const bedroomMatch = messageBody.match(/(\d+)\s*(dormitorio|cuarto|habitacion)/i);
        if (bedroomMatch) {
            propertyData.dormitorios = parseInt(bedroomMatch[1]);
        }

        // Extraer baños
        const bathroomMatch = messageBody.match(/(\d+)\s*(baño|bathroom)/i);
        if (bathroomMatch) {
            propertyData.banos = parseInt(bathroomMatch[1]);
        }

        // Extraer ubicación (después de "en" y antes del precio o características)
        const locationMatch = messageBody.match(/en\s+([^0-9]+?)(?=\s*\d|$)/i);
        if (locationMatch) {
            propertyData.ubicacion = locationMatch[1].trim();
        }

        // Extraer tipo de propiedad
        if (messageBody.toLowerCase().includes('casa')) {
            propertyData.tipo_propiedad = 'casa';
            propertyData.nombre_propiedad = `Casa en ${propertyData.ubicacion}`;
        } else if (messageBody.toLowerCase().includes('departamento')) {
            propertyData.tipo_propiedad = 'departamento';
            propertyData.nombre_propiedad = `Departamento en ${propertyData.ubicacion}`;
        } else {
            propertyData.tipo_propiedad = 'inmueble';
            propertyData.nombre_propiedad = `Propiedad en ${propertyData.ubicacion}`;
        }

        return propertyData;
    }

    // Parsear comando de crear cliente
    parseClientCommand(messageBody) {
        // Ejemplo: "NUEVO CLIENTE Juan Perez 70123456 juan@email.com"
        const parts = messageBody.split(' ').slice(2); // Saltar "NUEVO CLIENTE"

        return {
            nombre: parts[0] || '',
            apellido: parts[1] || '',
            telefono: parts.find(part => /^\d{8}$/.test(part)) || '',
            email: parts.find(part => /@/.test(part)) || ''
        };
    }

    // Parsear comando de crear agente
    parseAgentCommand(messageBody) {
        // Ejemplo: "REGISTRAR AGENTE Maria Lopez 70987654 AGENTE"
        const parts = messageBody.split(' ').slice(2); // Saltar "REGISTRAR AGENTE"

        return {
            nombre: parts[0] || '',
            apellido: parts[1] || '',
            telefono: parts.find(part => /^\d{8}$/.test(part)) || '',
            cargo: parts.find(part => ['AGENTE', 'GERENTE'].includes(part.toUpperCase())) || 'AGENTE'
        };
    }

    // Extraer ID de propiedad del comando
    extractPropertyId(messageBody) {
        const idMatch = messageBody.match(/propiedad\s+(\d+)/i) || messageBody.match(/id\s+(\d+)/i);
        return idMatch ? parseInt(idMatch[1]) : null;
    }

    // Extraer tipo de lista solicitada
    extractListType(messageBody) {
        const upperBody = messageBody.toUpperCase();

        if (upperBody.includes('PROPIEDAD')) return 'properties';
        if (upperBody.includes('CLIENTE')) return 'clients';
        if (upperBody.includes('AGENTE')) return 'agents';
        if (upperBody.includes('USUARIO')) return 'users';

        return 'all';
    }

    // Extraer filtros para listas
    extractFilters(messageBody) {
        const filters = {};

        // Filtro por ubicación
        const locationMatch = messageBody.match(/ubicacion\s+([^\s]+)/i);
        if (locationMatch) {
            filters.ubicacion = locationMatch[1];
        }

        // Filtro por precio
        const priceMatch = messageBody.match(/precio\s+(\d+)/i);
        if (priceMatch) {
            filters.precio_max = parseInt(priceMatch[1]);
        }

        return filters;
    }

    // Extraer tópico de ayuda
    extractHelpTopic(messageBody) {
        const upperBody = messageBody.toUpperCase();

        if (upperBody.includes('PROPIEDAD')) return 'properties';
        if (upperBody.includes('CLIENTE')) return 'clients';
        if (upperBody.includes('AGENTE')) return 'agents';
        if (upperBody.includes('COMANDO')) return 'commands';

        return 'general';
    }

    // Simular respuesta del backend (temporal)
    async simulateBackendResponse(backendRequest) {
        console.log('🎭 Simulando respuesta del backend (temporal)');

        await new Promise(resolve => setTimeout(resolve, 1000));

        const commandType = backendRequest.command.type;
        let response;

        switch (commandType) {
            case 'create_property':
                response = {
                    success: true,
                    action: 'property_created',
                    message: `✅ Propiedad registrada exitosamente\n\n📋 **Detalles:**\n• Tipo: ${backendRequest.command.parameters.propertyData.tipo_propiedad}\n• Ubicación: ${backendRequest.command.parameters.propertyData.ubicacion}\n• Precio: ${backendRequest.command.parameters.propertyData.precio} Bs\n• Dormitorios: ${backendRequest.command.parameters.propertyData.dormitorios}\n• Baños: ${backendRequest.command.parameters.propertyData.banos}\n\n🏠 ID de propiedad: #PROP001`,
                    data: { propertyId: 'PROP001', ...backendRequest.command.parameters.propertyData }
                };
                break;

            case 'create_client':
                response = {
                    success: true,
                    action: 'client_created',
                    message: `✅ Cliente registrado exitosamente\n\n👤 **Información:**\n• Nombre: ${backendRequest.command.parameters.clientData.nombre} ${backendRequest.command.parameters.clientData.apellido}\n• Teléfono: ${backendRequest.command.parameters.clientData.telefono}\n• Email: ${backendRequest.command.parameters.clientData.email}\n\n📝 ID de cliente: #CLI001`,
                    data: { clientId: 'CLI001', ...backendRequest.command.parameters.clientData }
                };
                break;

            case 'create_agent':
                response = {
                    success: true,
                    action: 'agent_created',
                    message: `✅ Agente registrado exitosamente\n\n👨‍💼 **Información:**\n• Nombre: ${backendRequest.command.parameters.agentData.nombre} ${backendRequest.command.parameters.agentData.apellido}\n• Teléfono: ${backendRequest.command.parameters.agentData.telefono}\n• Cargo: ${backendRequest.command.parameters.agentData.cargo}\n\n🆔 ID de usuario: #USER001`,
                    data: { userId: 'USER001', ...backendRequest.command.parameters.agentData }
                };
                break;

            case 'list_data':
                const listType = backendRequest.command.parameters.listType;
                response = {
                    success: true,
                    action: 'data_listed',
                    message: `📊 **Lista de ${listType}:**\n\n🏠 **Propiedades disponibles:**\n• Casa Equipetrol - 180,000 Bs\n• Departamento Z. Norte - 120,000 Bs\n• Local Comercial Centro - 95,000 Bs\n\n📱 Para más detalles, usa: "DETALLE PROPIEDAD [ID]"`,
                    data: { listType, count: 3 }
                };
                break;

            case 'help':
                response = {
                    success: true,
                    action: 'help_provided',
                    message: `ℹ️ **Comandos disponibles:**\n\n🏠 **Propiedades:**\n• NUEVA PROPIEDAD [detalles]\n• MODIFICAR PROPIEDAD [ID] [cambios]\n• LISTAR PROPIEDADES\n\n👤 **Clientes:**\n• NUEVO CLIENTE [nombre] [telefono]\n• LISTAR CLIENTES\n\n👨‍💼 **Agentes (solo gerentes):**\n• REGISTRAR AGENTE [nombre] [telefono] [cargo]\n\n💡 **Ejemplo:** NUEVA PROPIEDAD Casa en Equipetrol 150000 BS 3 dormitorios 2 baños`,
                    data: { topic: backendRequest.command.parameters.topic }
                };
                break;

            default:
                response = {
                    success: false,
                    action: 'unknown_command',
                    message: `❌ Comando no reconocido: "${commandType}"\n\nEscribe "AYUDA" para ver los comandos disponibles.`,
                    error: 'Unknown command type'
                };
        }

        return response;
    }

    // Procesar respuesta del backend
    async processBackendResponse(backendResponse) {
        console.log('📤 Procesando respuesta del backend');

        try {
            // Preparar datos para enviar al usuario
            const responseData = {
                message: backendResponse.message,
                success: backendResponse.success,
                timestamp: new Date().toISOString(),
                requiresFiles: false // Los comandos generalmente no requieren archivos
            };

            // Enviar respuesta al usuario
            const sendResult = await this.sendToResponseModule(responseData);

            return {
                processed: true,
                sent: sendResult.success,
                responseData,
                sendResult
            };

        } catch (error) {
            console.error('❌ Error procesando respuesta del backend:', error.message);
            throw error;
        }
    }

    // Enviar respuesta de permisos denegados
    async sendPermissionDeniedResponse(messageData, analysis, reason) {
        console.log('🚫 Enviando respuesta de permisos denegados');

        const responseData = {
            to: analysis.userPhone,
            message: `🚫 **Acceso Denegado**\n\n${reason}\n\n💡 Contacta a tu supervisor si necesitas estos permisos.`,
            timestamp: new Date().toISOString(),
            requiresFiles: false
        };

        try {
            await this.sendToResponseModule(responseData);

            return {
                action: 'permission_denied',
                processed: true,
                reason,
                response: responseData
            };

        } catch (error) {
            console.error('❌ Error enviando respuesta de permisos:', error.message);
            throw error;
        }
    }

    // Enviar respuesta de error
    async sendErrorResponse(messageData, analysis, errorMessage) {
        console.log('⚠️ Enviando respuesta de error del sistema');

        const responseData = {
            to: analysis.userPhone,
            message: `⚠️ **Error del Sistema**\n\nHubo un problema procesando tu comando. Por favor intenta de nuevo en unos minutos.\n\n🔧 Si el problema persiste, contacta al administrador del sistema.`,
            timestamp: new Date().toISOString(),
            requiresFiles: false,
            error: true
        };

        try {
            await this.sendToResponseModule(responseData);

            return {
                action: 'error_response_sent',
                processed: true,
                error: errorMessage,
                response: responseData
            };

        } catch (error) {
            return {
                action: 'failed_to_respond',
                processed: false,
                error: errorMessage,
                sendError: error.message
            };
        }
    }

    // Enviar respuesta al usuario
    async sendToResponseModule(responseData) {
        console.log('📡 Enviando al módulo de respuestas');

        try {
            // CAMBIAR DE SIMULACIÓN A REAL:
            const response = await axios.post(
                `${this.responsesUrl}/api/send/system`,
                {
                    to: responseData.to,
                    message: responseData.message,
                    timestamp: new Date().toISOString()
                },
                { timeout: this.timeout }
            );

            console.log('✅ Respuesta enviada al usuario');
            return response.data;

        } catch (error) {
            console.error('❌ Error enviando a módulo de respuestas:', error.message);
            throw error;
        }
    }

    // Obtener estadísticas del router
    getStats() {
        return {
            backendUrl: this.backendUrl,
            responsesUrl: this.responsesUrl,
            timeout: this.timeout
        };
    }

    // Verificar conectividad con servicios
    async checkConnectivity() {
        const results = {};

        // Verificar backend
        try {
            const response = await axios.get(`${this.backendUrl}/api/health`, { timeout: 5000 });
            results.backend = response.data.success;
        } catch (error) {
            results.backend = false;
        }

        // Verificar módulo de respuestas
        try {
            const response = await axios.get(`${this.responsesUrl}/api/health`, { timeout: 5000 });
            results.responses = response.data.success;
        } catch (error) {
            results.responses = false;
        }

        // Verificar módulo IA
        try {
            const response = await axios.get(`${this.iaUrl}/api/health`, { timeout: 5000 });
            results.ia = response.data.status === 'healthy';
        } catch (error) {
            results.ia = false;
        }

        return results;
    }

    // Enviar consulta al módulo IA
    async sendToIA(queryData, attempt = 1) {
        try {
            console.log('🤖 Enviando consulta al módulo IA:', {
                from: queryData.from_phone,
                question: queryData.question?.substring(0, 50) + '...'
            });

            const iaRequest = {
                question: queryData.question,
                from_phone: queryData.from_phone,
                to_phone: queryData.to_phone,
                conversation_history: queryData.conversation_history || '',
                source: 'whatsapp'
            };

            console.log(`📡 Enviando a: ${this.iaUrl}/api/query`);
            const startTime = Date.now();
            const response = await axios.post(
                `${this.iaUrl}/api/query`,
                iaRequest,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'processing-module'
                    }
                }
            );

            const iaResponse = response.data;
            const responseTime = Date.now() - startTime;
            console.log(`⏱️ TIEMPO RESPUESTA IA: ${responseTime}ms`);
            
            // 🔍 LOG DETALLADO - PROCESAMIENTO RECIBE IA
            console.log('🔍 PROCESAMIENTO PASO 1 - Respuesta IA recibida:');
            console.log(`   ✅ success: ${iaResponse.success}`);
            console.log(`   📝 answer: '${iaResponse.answer?.substring(0, 100)}...' (len: ${iaResponse.answer?.length || 0})`);
            console.log(`   📊 used_context: ${iaResponse.used_context}`);
            console.log(`   🎯 requires_agent_attention: ${iaResponse.requires_agent_attention}`);

            if (iaResponse.success) {
                // Preparar respuesta para módulo de respuestas
                // IMPORTANTE: La respuesta debe ir desde el AGENTE al CLIENTE
                const responseForProcessing = {
                    to: queryData.from_phone, // Cliente que hizo la consulta
                    from: queryData.to_phone, // Agente que debe responder 
                    message: iaResponse.answer,
                    type: 'text',
                    responseMode: 'agent-to-client', // Especificar que es desde agente
                    metadata: {
                        ...iaResponse.metadata,
                        original_query: queryData.question,
                        requires_agent_attention: iaResponse.requires_agent_attention,
                        suggested_actions: iaResponse.suggested_actions,
                        source: 'ia-module',
                        agent_phone: queryData.to_phone
                    }
                };

                // 🔍 LOG DETALLADO - PROCESAMIENTO PREPARA ENVÍO
                console.log('🔍 PROCESAMIENTO PASO 2 - Preparando respuesta para envío:');
                console.log(`   📞 to: ${responseForProcessing.to}`);
                console.log(`   👤 from: ${responseForProcessing.from}`);
                console.log(`   📝 message: '${responseForProcessing.message?.substring(0, 100)}...' (len: ${responseForProcessing.message?.length || 0})`);
                console.log(`   📋 type: ${responseForProcessing.type}`);
                console.log(`   🎯 responseMode: ${responseForProcessing.responseMode}`);

                // Enviar al módulo de respuestas para cliente (desde agente)
                return await this.sendToClientFromAgent(responseForProcessing);
            } else {
                throw new Error('IA module returned error response');
            }

        } catch (error) {
            console.error(`❌ Error enviando a IA (intento ${attempt}):`, error.message);

            if (attempt < this.maxRetries) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms... (${attempt}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendToIA(queryData, attempt + 1);
            } else {
                // Respuesta de fallback - DESDE EL AGENTE
                const fallbackResponse = {
                    to: queryData.from_phone, // Cliente
                    from: queryData.to_phone, // Agente que debe responder
                    message: 'Disculpa, el sistema de consultas no está disponible temporalmente. Te contacto personalmente en unos minutos.',
                    type: 'text',
                    responseMode: 'agent-to-client',
                    metadata: {
                        error: error.message,
                        fallback: true,
                        requires_agent_attention: true,
                        agent_phone: queryData.to_phone
                    }
                };

                return await this.sendToClientFromAgent(fallbackResponse);
            }
        }
    }

    // NUEVO: Enviar respuesta al cliente desde el agente
    async sendToClientFromAgent(responseData, attempt = 1) {
        try {
            // Generar clave única más robusta para evitar duplicados
            const messageKey = `${responseData.from}-${responseData.to}`;
            const now = Date.now();
            
            // Anti-spam INTELIGENTE: Solo bloquear contenido duplicado
            const contentHash = responseData.message?.substring(0, 50) || 'empty';
            const contentKey = `${messageKey}-${contentHash}`;
            
            console.log(`🔍 Anti-spam check: ${contentKey.substring(0, 80)}...`);
            
            if (this.sentMessages.has(contentKey)) {
                const lastSent = this.sentMessages.get(contentKey);
                const timeDiff = now - lastSent;
                console.log(`⏰ Último envío hace ${timeDiff}ms`);
                
                if (timeDiff < 10000) { // Solo 10s para contenido idéntico
                    console.log('⏭️ Mensaje IDÉNTICO detectado, evitando spam (< 10s)');
                    return { success: true, message: 'Anti-spam: contenido duplicado' };
                }
            }

            console.log('👨‍💼➡️👤 Enviando respuesta al cliente desde agente:', {
                to: responseData.to,
                from: responseData.from,
                message: responseData.message?.substring(0, 50) + '...'
            });

            // Limpiar cache viejo (más de 2 minutos)
            for (const [key, timestamp] of this.sentMessages.entries()) {
                if (now - timestamp > 120000) {
                    this.sentMessages.delete(key);
                }
            }

            // 🔍 LOG DETALLADO - PROCESAMIENTO ENVÍA A RESPUESTAS
            const payloadToResponses = {
                to: responseData.to, // Cliente
                agentPhone: responseData.from, // Agente que responde (campo correcto)
                message: responseData.message,
                type: responseData.type || 'text',
                metadata: responseData.metadata || {},
                source: 'agent-response'
            };
            
            console.log('🔍 PROCESAMIENTO PASO 3 - Enviando a módulo Respuestas:');
            console.log(`   📡 URL: ${this.responsesUrl}/api/send/client`);
            console.log(`   📞 to: ${payloadToResponses.to}`);
            console.log(`   👤 agentPhone: ${payloadToResponses.agentPhone}`);
            console.log(`   📝 message: '${payloadToResponses.message?.substring(0, 100)}...' (len: ${payloadToResponses.message?.length || 0})`);
            console.log(`   📋 type: ${payloadToResponses.type}`);
            console.log(`   🏷️ source: ${payloadToResponses.source}`);

            // Usar endpoint específico para cliente (desde agente)
            const response = await axios.post(
                `${this.responsesUrl}/api/send/client`,
                payloadToResponses,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'processing-module',
                        'X-Response-Mode': 'agent-to-client'
                    }
                }
            );

            // ✅ SOLO registrar como enviado si el envío fue exitoso (usar clave de contenido)
            this.sentMessages.set(contentKey, now);
            console.log('✅ Respuesta enviada al cliente desde agente');
            return response.data;

        } catch (error) {
            console.error(`❌ Error enviando respuesta desde agente (intento ${attempt}):`, error.message);

            if (attempt < this.maxRetries) {
                console.log(`🔄 Reintentando en ${this.retryDelay}ms... (${attempt}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendToClientFromAgent(responseData, attempt + 1);
            }

            throw new Error(`No se pudo enviar respuesta desde agente después de ${this.maxRetries} intentos`);
        }
    }
}

module.exports = SystemRouter;