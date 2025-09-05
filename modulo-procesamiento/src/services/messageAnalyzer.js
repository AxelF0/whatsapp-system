// servidor/modulo-procesamiento/src/services/messageAnalyzer.js

class MessageAnalyzer {
    constructor(userValidator) {
        this.userValidator = userValidator;
        // Número del sistema (con API oficial) - cambiar por tu número real
        this.systemNumber = process.env.SYSTEM_WHATSAPP_NUMBER || '59180000000';
    }

    async analyzeMessage(messageData) {
        console.log('🔍 ANALIZANDO MENSAJE');
        console.log('Datos completos:', messageData);

        try {
            const analysis = {
                messageId: messageData.messageId || messageData.id,
                from: messageData.from,
                to: messageData.to,
                source: messageData.source,
                timestamp: messageData.timestamp || new Date(),
                body: messageData.body || ''
            };

            // Si viene con userData, es un comando del sistema
            if (messageData.userData) {
                console.log('✅ Detectado como comando del sistema (tiene userData)');
                analysis.type = 'system_command';
                analysis.description = `${messageData.userData.cargo_nombre} enviando comando`;
                analysis.userPhone = messageData.from;
                analysis.userData = messageData.userData;
                analysis.requiresBackend = true;
                analysis.requiresIA = false;

                return analysis;
            }

            // Si es whatsapp-web y el TO es el sistema
            if (messageData.source === 'whatsapp-web') {
                // Intentar validar si es usuario del sistema
                const userValidation = await this.userValidator.validateUser(messageData.from);

                if (userValidation.isValid) {
                    console.log('✅ Usuario validado como agente/gerente');
                    analysis.type = 'system_command';
                    analysis.description = `${userValidation.userData.cargo_nombre} enviando comando`;
                    analysis.userPhone = messageData.from;
                    analysis.userData = userValidation.userData;
                    analysis.requiresBackend = true;
                    analysis.requiresIA = false;
                } else {
                    // TODO: Temporalmente deshabilitado el flujo cliente-agente
                    // console.log('❌ No es usuario del sistema, tratando como cliente');
                    // analysis.type = 'client_query';
                    // analysis.description = 'Cliente consultando';
                    // analysis.clientPhone = messageData.from;
                    // analysis.agentPhone = messageData.to;
                    // analysis.requiresIA = true;
                    // analysis.requiresBackend = false;
                    
                    // Por ahora, rechazar mensajes de no-usuarios
                    throw new Error('Número no autorizado para usar el sistema');
                }

                return analysis;
            }

            // Resto del código...
            return analysis;

        } catch (error) {
            console.error('❌ Error en análisis:', error.message);
            throw error;
        }
    }

    // TODO: Temporalmente deshabilitado el análisis de consultas de clientes
    /*
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
    */

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