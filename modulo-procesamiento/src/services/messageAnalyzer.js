// servidor/modulo-procesamiento/src/services/messageAnalyzer.js

class MessageAnalyzer {
    constructor(userValidator) {
        this.userValidator = userValidator;
        // Número del sistema (con API oficial) - cambiar por tu número real
        this.systemNumber = process.env.SYSTEM_WHATSAPP_NUMBER || '59180000000';
    }

    async analyzeMessage(messageData) {
        console.log('🔍 Analizando mensaje:', {
            from: messageData.from,
            to: messageData.to,
            source: messageData.source
        });

        try {
            // 1. Determinar el tipo basado en la fuente y destinatario
            const analysis = {
                messageId: messageData.messageId || messageData.id,
                from: messageData.from,
                to: messageData.to,
                source: messageData.source,
                timestamp: messageData.timestamp || new Date(),
                body: messageData.body || ''
            };

            // 2. Lógica de análisis según tu explicación:
            if (messageData.source === 'whatsapp-web') {
                // Mensaje llegó por WhatsApp-Web = Cliente escribiendo a Agente
                analysis.type = 'client_query';
                analysis.description = 'Cliente consultando a un agente';
                analysis.clientPhone = messageData.from;
                analysis.agentPhone = messageData.to;
                analysis.requiresIA = true;
                analysis.requiresBackend = false;

            } else if (messageData.source === 'whatsapp-api') {
                // Mensaje llegó por API Oficial = Alguien escribiendo al Sistema
                
                // Primero validar si quien escribe es usuario registrado
                const userValidation = await this.userValidator.validateUser(messageData.from);
                
                if (userValidation.isValid) {
                    // Es un agente/gerente registrado
                    analysis.type = 'system_command';
                    analysis.description = `${userValidation.userData.cargo_nombre} enviando comando al sistema`;
                    analysis.userPhone = messageData.from;
                    analysis.userData = userValidation.userData;
                    analysis.systemPhone = messageData.to;
                    analysis.requiresIA = false;
                    analysis.requiresBackend = true;
                } else {
                    // Usuario no registrado - ignorar
                    analysis.type = 'invalid_user';
                    analysis.description = 'Usuario no registrado en el sistema';
                    analysis.requiresIA = false;
                    analysis.requiresBackend = false;
                }

            } else {
                // Fuente no reconocida
                analysis.type = 'unknown_source';
                analysis.description = 'Fuente de mensaje no reconocida';
                analysis.requiresIA = false;
                analysis.requiresBackend = false;
            }

            // 3. Análisis adicional del contenido (si es necesario)
            if (analysis.type === 'client_query') {
                analysis.contentAnalysis = this.analyzeClientQuery(analysis.body);
            } else if (analysis.type === 'system_command') {
                analysis.contentAnalysis = this.analyzeSystemCommand(analysis.body);
            }

            console.log('✅ Análisis completado:', analysis.type);
            return analysis;

        } catch (error) {
            console.error('❌ Error en análisis de mensaje:', error.message);
            
            return {
                type: 'error',
                description: 'Error analizando mensaje',
                error: error.message,
                requiresIA: false,
                requiresBackend: false
            };
        }
    }

    // Analizar consulta de cliente (para IA)
    analyzeClientQuery(messageBody) {
        const analysis = {
            hasGreeting: this.containsGreeting(messageBody),
            hasPropertyRequest: this.containsPropertyRequest(messageBody),
            hasPriceRange: this.containsPriceRange(messageBody),
            hasLocationPreference: this.containsLocation(messageBody),
            intent: 'unknown'
        };

        // Determinar intención principal
        if (analysis.hasPropertyRequest) {
            analysis.intent = 'property_search';
        } else if (analysis.hasGreeting && !analysis.hasPropertyRequest) {
            analysis.intent = 'greeting';
        } else if (messageBody.toLowerCase().includes('ayuda') || messageBody.toLowerCase().includes('help')) {
            analysis.intent = 'help_request';
        } else {
            analysis.intent = 'general_query';
        }

        return analysis;
    }

    // Analizar comando de sistema (para Backend)
    analyzeSystemCommand(messageBody) {
        const analysis = {
            isCommand: this.isCommand(messageBody),
            commandType: 'unknown',
            parameters: []
        };

        const upperBody = messageBody.toUpperCase();

        // Detectar tipos de comando
        if (upperBody.includes('NUEVA PROPIEDAD') || upperBody.includes('REGISTRAR PROPIEDAD')) {
            analysis.commandType = 'create_property';
        } else if (upperBody.includes('MODIFICAR PROPIEDAD') || upperBody.includes('ACTUALIZAR PROPIEDAD')) {
            analysis.commandType = 'update_property';
        } else if (upperBody.includes('ELIMINAR PROPIEDAD') || upperBody.includes('BORRAR PROPIEDAD')) {
            analysis.commandType = 'delete_property';
        } else if (upperBody.includes('NUEVO CLIENTE') || upperBody.includes('REGISTRAR CLIENTE')) {
            analysis.commandType = 'create_client';
        } else if (upperBody.includes('REGISTRAR AGENTE') || upperBody.includes('NUEVO AGENTE')) {
            analysis.commandType = 'create_agent';
        } else if (upperBody.includes('LISTAR') || upperBody.includes('MOSTRAR')) {
            analysis.commandType = 'list_data';
        } else if (upperBody.includes('AYUDA') || upperBody.includes('HELP')) {
            analysis.commandType = 'help';
        }

        return analysis;
    }

    // Helpers para análisis de contenido
    containsGreeting(text) {
        const greetings = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'saludos'];
        return greetings.some(greeting => text.toLowerCase().includes(greeting));
    }

    containsPropertyRequest(text) {
        const propertyKeywords = ['casa', 'departamento', 'propiedad', 'inmueble', 'terreno', 'oficina', 'local'];
        return propertyKeywords.some(keyword => text.toLowerCase().includes(keyword));
    }

    containsPriceRange(text) {
        // Buscar números seguidos de "bs", "bolivianos", "$", etc.
        const pricePatterns = /(\d+)\s*(bs|bolivianos?|\$|dolares?|usd)/i;
        return pricePatterns.test(text);
    }

    containsLocation(text) {
        // Ubicaciones comunes en Santa Cruz (ajustar según tu región)
        const locations = ['zona norte', 'zona sur', 'zona este', 'zona oeste', 'centro', 'plan 3000', 'la ramada', 'equipetrol'];
        return locations.some(location => text.toLowerCase().includes(location));
    }

    isCommand(text) {
        // Un comando típicamente empieza con palabras imperativas o tiene estructura formal
        const commandWords = ['registrar', 'crear', 'nueva', 'nuevo', 'modificar', 'actualizar', 'eliminar', 'borrar', 'listar', 'mostrar'];
        return commandWords.some(word => text.toLowerCase().includes(word));
    }

    // Extraer parámetros de un comando (implementar según tus necesidades)
    extractCommandParameters(messageBody, commandType) {
        const parameters = {};

        // Ejemplo para crear propiedad: "NUEVA PROPIEDAD Casa en Equipetrol 150000 BS 3 dormitorios"
        if (commandType === 'create_property') {
            // Implementar parsing de parámetros de propiedad
            // Esto se puede hacer más sofisticado con regex o NLP
        }

        return parameters;
    }

    // Determinar prioridad del mensaje
    getPriority(analysis) {
        if (analysis.type === 'system_command') {
            return 'high';
        } else if (analysis.type === 'client_query') {
            return 'medium';
        } else {
            return 'low';
        }
    }

    // Validar si el mensaje necesita procesamiento inmediato
    needsImmediateProcessing(analysis) {
        return analysis.type === 'client_query' || analysis.type === 'system_command';
    }
}

module.exports = MessageAnalyzer;