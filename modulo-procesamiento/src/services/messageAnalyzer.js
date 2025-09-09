// servidor/modulo-procesamiento/src/services/messageAnalyzer.js

class MessageAnalyzer {
    constructor(userValidator) {
        this.userValidator = userValidator;
        // Número del sistema (con API oficial) - cambiar por tu número real
        this.systemNumber = process.env.SYSTEM_WHATSAPP_NUMBER || '59171337051';
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

            // Si es whatsapp-web-agent (cliente hablando a agente)
            if (messageData.source === 'whatsapp-web-agent') {
                console.log(`🔍 Mensaje de WhatsApp Web Agent detectado: cliente → agente`);
                
                // NO validar usuario - es un cliente hablando al agente
                console.log('📞 Cliente consultando al agente, analizando consulta...');
                
                // Analizar si es consulta inmobiliaria
                const queryAnalysis = this.analyzeClientQuery(messageData.body);
                
                analysis.type = 'client_query';
                analysis.description = 'Cliente consultando sobre propiedades';
                analysis.clientPhone = messageData.from;
                analysis.agentPhone = messageData.to; // El agente que debe responder
                analysis.requiresIA = queryAnalysis.isRealEstateQuery;
                analysis.requiresBackend = !queryAnalysis.isRealEstateQuery;
                analysis.queryAnalysis = queryAnalysis;

                return analysis;
            }
            
            // Si es whatsapp-web (agente/gerente hablando al sistema)
            if (messageData.source === 'whatsapp-web') {
                console.log(`🔍 Mensaje de WhatsApp Web detectado: usuario → sistema`);
                
                // VALIDAR SOLO si el mensaje es para el número del sistema
                if (messageData.to === this.systemNumber) {
                    console.log(`📞 Mensaje dirigido al sistema (${this.systemNumber}), validando usuario...`);
                    
                    // Intentar validar si es usuario del sistema
                    console.log(`🔍 Validando usuario: ${messageData.from}`);
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
                        console.log('❌ Usuario no válido para comandos del sistema');
                        analysis.type = 'unauthorized';
                        analysis.description = 'Usuario no autorizado';
                        analysis.requiresBackend = false;
                        analysis.requiresIA = false;
                    }
                } else {
                    console.log(`📱 Mensaje NO dirigido al sistema (va a: ${messageData.to}), tratando como consulta cliente`);
                    
                    // Tratar como consulta de cliente sin validación
                    const queryAnalysis = this.analyzeClientQuery(messageData.body);
                    
                    analysis.type = 'client_query';
                    analysis.description = 'Cliente consultando sobre propiedades';
                    analysis.clientPhone = messageData.from;
                    analysis.agentPhone = messageData.to;
                    analysis.requiresIA = queryAnalysis.isRealEstateQuery;
                    analysis.requiresBackend = !queryAnalysis.isRealEstateQuery;
                    analysis.queryAnalysis = queryAnalysis;
                }

                return analysis;
            }

            // Si no es ningún caso específico, es mensaje genérico
            console.log('❓ Mensaje no clasificado, tratando como genérico');
            analysis.type = 'generic';
            analysis.description = 'Mensaje genérico no clasificado';
            analysis.requiresBackend = false;
            analysis.requiresIA = false;
            
            return analysis;

        } catch (error) {
            console.error('❌ Error en análisis:', error.message);
            throw error;
        }
    }

    // Analizar consulta de cliente para determinar si necesita IA
    analyzeClientQuery(messageBody) {
        if (!messageBody || messageBody.trim().length === 0) {
            return {
                isRealEstateQuery: false,
                queryType: 'empty',
                confidence: 0
            };
        }

        const body = messageBody.toLowerCase().trim();
        
        // Palabras clave inmobiliarias
        const realEstateKeywords = [
            // Tipos de propiedad
            'casa', 'casas', 'departamento', 'departamentos', 'terreno', 'terrenos',
            'propiedad', 'propiedades', 'inmueble', 'inmuebles', 'lote', 'lotes',
            
            // Operaciones
            'venta', 'vender', 'comprar', 'compra', 'alquiler', 'alquilar', 'rentar',
            'arrendar', 'inversión', 'invertir',
            
            // Ubicaciones (genéricas)
            'zona', 'ubicacion', 'ubicación', 'barrio', 'sector', 'área',
            'norte', 'sur', 'este', 'oeste', 'centro', 'equipetrol',
            
            // Características
            'dormitorio', 'dormitorios', 'habitacion', 'habitaciones', 'baño', 'baños',
            'superficie', 'metros', 'm2', 'garage', 'jardín', 'jardin', 'piscina',
            
            // Precios y financiamiento
            'precio', 'precios', 'costo', 'costos', 'valor', 'cuanto', 'cuánto',
            'financiamiento', 'credito', 'crédito', 'hipoteca', 'anticipo',
            
            // Consultas típicas
            'disponible', 'disponibles', 'mostrar', 'ver', 'visita', 'cita',
            'información', 'informacion', 'detalles', 'caracteristicas',
            'remaxi', 'inmobiliaria'
        ];
        
        // Saludos que no son consultas inmobiliarias
        const greetings = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'saludos'];
        
        // Contar coincidencias
        let keywordMatches = 0;
        let greetingMatches = 0;
        
        for (const keyword of realEstateKeywords) {
            if (body.includes(keyword)) {
                keywordMatches++;
            }
        }
        
        for (const greeting of greetings) {
            if (body.includes(greeting)) {
                greetingMatches++;
            }
        }
        
        // Determinar tipo de consulta
        let queryType = 'other';
        let isRealEstateQuery = false;
        let confidence = 0;
        
        if (keywordMatches >= 2) {
            // Al menos 2 palabras clave inmobiliarias
            isRealEstateQuery = true;
            confidence = Math.min(0.9, 0.3 + (keywordMatches * 0.15));
            
            if (body.includes('precio') || body.includes('cuanto')) {
                queryType = 'price_inquiry';
            } else if (body.includes('venta') || body.includes('comprar')) {
                queryType = 'sale_inquiry';
            } else if (body.includes('alquiler') || body.includes('rentar')) {
                queryType = 'rental_inquiry';
            } else if (body.includes('zona') || body.includes('ubicacion')) {
                queryType = 'location_inquiry';
            } else {
                queryType = 'property_inquiry';
            }
        } else if (keywordMatches === 1 && greetingMatches === 0) {
            // 1 palabra clave pero sin saludos
            isRealEstateQuery = true;
            confidence = 0.6;
            queryType = 'general_inquiry';
        } else if (greetingMatches > 0 && keywordMatches === 0) {
            // Solo saludo
            isRealEstateQuery = true; // Lo enviamos a IA para respuesta amigable
            confidence = 0.4;
            queryType = 'greeting';
        }
        
        console.log(`🤖 Análisis IA: "${body.substring(0, 30)}..." -> ${isRealEstateQuery ? 'SI' : 'NO'} (${confidence.toFixed(2)})`);
        
        return {
            isRealEstateQuery,
            queryType,
            confidence,
            keywordMatches,
            detectedKeywords: realEstateKeywords.filter(kw => body.includes(kw))
        };
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
        } else if (upperBody.includes('ELIMINAR PROPIEDAD')) {
            analysis.commandType = 'delete_property';
        } else if (upperBody.includes('ACTIVAR PROPIEDAD')) {
            analysis.commandType = 'activate_property';
        } else if (upperBody.includes('NUEVO CLIENTE') || upperBody.includes('REGISTRAR CLIENTE')) {
            analysis.commandType = 'create_client';
        } else if (upperBody.includes('BAJA CLIENTE')) {
            analysis.commandType = 'deactivate_client';
        } else if (upperBody.includes('ALTA CLIENTE')) {
            analysis.commandType = 'activate_client';
        } else if (upperBody.includes('CAMBIAR CLIENTE')) {
            analysis.commandType = 'toggle_client';
        } else if (upperBody.includes('ELIMINAR CLIENTE')) {
            analysis.commandType = 'delete_client';
        } else if (upperBody.includes('REACTIVAR CLIENTE')) {
            analysis.commandType = 'activate_client';
        } else if (upperBody.includes('REGISTRAR AGENTE') || upperBody.includes('NUEVO AGENTE')) {
            analysis.commandType = 'create_agent';
        } else if (upperBody.includes('LISTAR') || upperBody.includes('MOSTRAR')) {
            analysis.commandType = 'list_data';
        } else if (upperBody.includes('BUSCAR OPERACION')) {
            analysis.commandType = 'search_by_operation';
        } else if (upperBody.includes('BUSCAR TIPO')) {
            analysis.commandType = 'search_by_property_type';
        } else if (upperBody.includes('BUSCAR ESTADO')) {
            analysis.commandType = 'search_by_status';
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