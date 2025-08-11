// servidor/modulo-procesamiento/src/services/systemRouter.js

const axios = require('axios');

class SystemRouter {
    constructor() {
        this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3004';
        this.responsesUrl = process.env.RESPONSES_URL || 'http://localhost:3005';
        this.timeout = 15000; // 15 segundos
    }

    // Rutear comando de sistema al backend
    async routeToBackend(messageData, analysis) {
        console.log('⚙️ Ruteando comando de sistema al backend:', {
            user: analysis.userData.nombre,
            command: analysis.contentAnalysis?.commandType || 'unknown'
        });

        try {
            // 1. Validar permisos del usuario para el comando
            const permissionCheck = await this.validateCommandPermissions(analysis);
            
            if (!permissionCheck.hasPermission) {
                return await this.sendPermissionDeniedResponse(messageData, analysis, permissionCheck.reason);
            }

            // 2. Preparar request para el backend
            const backendRequest = this.prepareBackendRequest(messageData, analysis);

            // 3. Por ahora simular respuesta del backend (hasta que lo implementes)
            const simulatedResponse = await this.simulateBackendResponse(backendRequest);

            // 4. Procesar respuesta del backend
            const processedResponse = await this.processBackendResponse(simulatedResponse);

            return {
                action: 'sent_to_backend',
                processed: true,
                permissionCheck,
                backendRequest,
                backendResponse: simulatedResponse,
                finalResponse: processedResponse
            };

        } catch (error) {
            console.error('❌ Error ruteando al backend:', error.message);
            
            return await this.sendErrorResponse(messageData, analysis, error.message);
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

    // Enviar al módulo de respuestas
    async sendToResponseModule(responseData) {
        console.log('📡 Enviando al módulo de respuestas');

        try {
            // Por ahora simular el envío
            console.log('📤 Simulando envío de respuesta del sistema:');
            console.log('   Mensaje:', responseData.message.substring(0, 100) + '...');

            return {
                success: true,
                sent: true,
                timestamp: new Date().toISOString()
            };

            // Cuando tengas el módulo de respuestas:
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

        return results;
    }
}

module.exports = SystemRouter;