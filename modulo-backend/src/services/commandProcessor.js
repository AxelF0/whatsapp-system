// servidor/modulo-backend/src/services/commandProcessor.js

const axios = require('axios');

class CommandProcessor {
    constructor(propertyService, clientService, userService) {
        this.propertyService = propertyService;
        this.clientService = clientService;
        this.userService = userService;

        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        this.responsesUrl = process.env.RESPONSES_URL || 'http://localhost:3005';

        // Estadísticas de comandos
        this.stats = {
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            commandsByType: {},
            commandsByUser: {}
        };

        // Definir comandos disponibles
        this.commands = this.defineCommands();
    }

    // Definir todos los comandos disponibles
    defineCommands() {
        return {
            // Comandos de propiedades
            'create_property': {
                name: 'Crear Propiedad',
                description: 'Registra una nueva propiedad en el sistema',
                format: 'NUEVA PROPIEDAD [nombre] [precio] [ubicación] [dormitorios] [baños]',
                example: 'NUEVA PROPIEDAD Casa en Equipetrol 150000 3 dormitorios 2 baños',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleCreateProperty.bind(this)
            },
            'update_property': {
                name: 'Actualizar Propiedad',
                description: 'Modifica los datos de una propiedad existente',
                format: 'MODIFICAR PROPIEDAD [ID] [campo] [nuevo valor]',
                example: 'MODIFICAR PROPIEDAD PROP001 precio 160000',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleUpdateProperty.bind(this)
            },
            'delete_property': {
                name: 'Eliminar Propiedad',
                description: 'Elimina una propiedad del sistema',
                format: 'ELIMINAR PROPIEDAD [ID]',
                example: 'ELIMINAR PROPIEDAD PROP001',
                requiredRole: ['gerente'],
                handler: this.handleDeleteProperty.bind(this)
            },
            'list_properties': {
                name: 'Listar Propiedades',
                description: 'Muestra lista de propiedades disponibles',
                format: 'LISTAR PROPIEDADES [filtros opcionales]',
                example: 'LISTAR PROPIEDADES zona norte',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleListProperties.bind(this)
            },
            'property_details': {
                name: 'Ver Detalles de Propiedad',
                description: 'Muestra información completa de una propiedad',
                format: 'VER PROPIEDAD [ID]',
                example: 'VER PROPIEDAD PROP001',
                requiredRole: ['agente', 'gerente'],
                handler: this.handlePropertyDetails.bind(this)
            },

            // Comandos de clientes
            'create_client': {
                name: 'Registrar Cliente',
                description: 'Registra un nuevo cliente potencial',
                format: 'NUEVO CLIENTE [nombre] [apellido] [teléfono]',
                example: 'NUEVO CLIENTE Juan Pérez 70123456',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleCreateClient.bind(this)
            },
            'update_client': {
                name: 'Actualizar Cliente',
                description: 'Actualiza información del cliente',
                format: 'MODIFICAR CLIENTE [teléfono] [campo] [valor]',
                example: 'MODIFICAR CLIENTE 70123456 email juan@email.com',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleUpdateClient.bind(this)
            },
            'list_clients': {
                name: 'Listar Clientes',
                description: 'Muestra lista de clientes registrados',
                format: 'LISTAR CLIENTES',
                example: 'LISTAR CLIENTES',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleListClients.bind(this)
            },
            'client_history': {
                name: 'Historial de Cliente',
                description: 'Muestra el historial de interacciones con un cliente',
                format: 'HISTORIAL CLIENTE [teléfono]',
                example: 'HISTORIAL CLIENTE 70123456',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleClientHistory.bind(this)
            },

            // Comandos de usuarios (solo gerentes)
            'create_agent': {
                name: 'Registrar Agente',
                description: 'Registra un nuevo agente en el sistema',
                format: 'REGISTRAR AGENTE [nombre] [apellido] [teléfono]',
                example: 'REGISTRAR AGENTE María López 70987654',
                requiredRole: ['gerente'],
                handler: this.handleCreateAgent.bind(this)
            },
            'update_agent': {
                name: 'Actualizar Agente',
                description: 'Actualiza información de un agente',
                format: 'MODIFICAR AGENTE [teléfono] [campo] [valor]',
                example: 'MODIFICAR AGENTE 70987654 estado activo',
                requiredRole: ['gerente'],
                handler: this.handleUpdateAgent.bind(this)
            },
            'list_agents': {
                name: 'Listar Agentes',
                description: 'Muestra lista de agentes del sistema',
                format: 'LISTAR AGENTES',
                example: 'LISTAR AGENTES',
                requiredRole: ['gerente'],
                handler: this.handleListAgents.bind(this)
            },

            // Comandos de reportes
            'daily_report': {
                name: 'Reporte Diario',
                description: 'Genera reporte de actividad del día',
                format: 'REPORTE DIARIO [fecha opcional]',
                example: 'REPORTE DIARIO',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleDailyReport.bind(this)
            },
            'monthly_report': {
                name: 'Reporte Mensual',
                description: 'Genera reporte de actividad del mes',
                format: 'REPORTE MENSUAL [mes] [año]',
                example: 'REPORTE MENSUAL 11 2024',
                requiredRole: ['gerente'],
                handler: this.handleMonthlyReport.bind(this)
            },

            // Comando de ayuda
            'add_property_file': {
                name: 'Adjuntar Archivo a Propiedad',
                description: 'Adjunta un archivo (documento, imagen o video) a una propiedad',
                format: 'ADJUNTAR ARCHIVO [archivo]',
                example: 'ADJUNTAR ARCHIVO [enviar archivo]',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleAttachPropertyFile.bind(this)
            },

            'search_properties': {
                name: 'Buscar Propiedades',
                description: 'Busca propiedades según criterios',
                format: 'BUSCAR PROPIEDADES [criterios]',
                example: 'BUSCAR PROPIEDADES tipo:casa precio:200000-300000',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleSearchProperties.bind(this)
            },

            'broadcast_message': {
                name: 'Envío Masivo',
                description: 'Envía un mensaje a múltiples destinatarios',
                format: 'ENVIO MASIVO [grupo] [mensaje]',
                example: 'ENVIO MASIVO clientes Buenos días, tenemos nuevas propiedades...',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleBroadcastMessage.bind(this)
            },

            'help': {
                name: 'Ayuda',
                description: 'Muestra comandos disponibles',
                format: 'AYUDA [comando opcional]',
                example: 'AYUDA',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleHelp.bind(this)
            }
        };
    }

    // Procesar comando entrante
    async processCommand(commandData) {
        console.log('⚙️ Procesando comando:', commandData.command?.type);

        try {
            // Validar estructura del comando
            if (!commandData.command || !commandData.user) {
                throw new Error('Datos de comando incompletos');
            }

            // Validar que el comando existe
            const commandType = commandData.command.type;
            const commandDef = this.commands[commandType];

            if (!commandDef) {
                throw new Error(`Comando no reconocido: ${commandType}`);
            }

            // Validar permisos del usuario
            const userRole = commandData.user.role?.toLowerCase();
            if (!commandDef.requiredRole.includes(userRole)) {
                throw new Error(`No tienes permisos para ejecutar: ${commandDef.name}`);
            }

            // Ejecutar el handler del comando
            const result = await commandDef.handler(commandData);

            // Actualizar estadísticas
            this.stats.totalCommands++;
            this.stats.successfulCommands++;
            this.stats.commandsByType[commandType] = (this.stats.commandsByType[commandType] || 0) + 1;
            this.stats.commandsByUser[commandData.user.id] = (this.stats.commandsByUser[commandData.user.id] || 0) + 1;

            // Enviar respuesta al usuario
            await this.sendResponse(commandData.user, result);

            return result;

        } catch (error) {
            console.error('❌ Error procesando comando:', error.message);

            this.stats.totalCommands++;
            this.stats.failedCommands++;

            // Enviar respuesta de error
            await this.sendErrorResponse(commandData.user, error.message);

            throw error;
        }
    }

    // ==================== HANDLERS DE COMANDOS ====================

    // Handler: Crear Propiedad
    async handleCreateProperty(commandData) {
        const params = commandData.command.parameters;

        const propertyData = {
            usuario_id: commandData.user.id,
            nombre_propiedad: params.propertyData?.nombre_propiedad || 'Propiedad sin nombre',
            descripcion: params.propertyData?.descripcion || '',
            precio: params.propertyData?.precio || 0,
            ubicacion: params.propertyData?.ubicacion || '',
            tamano: params.propertyData?.tamano || '',
            tipo_propiedad: params.propertyData?.tipo_propiedad || 'casa',
            dormitorios: params.propertyData?.dormitorios || 0,
            banos: params.propertyData?.banos || 0,
            estado: 1
        };

        const property = await this.propertyService.create(propertyData);

        // Formatear ID para mostrar
        const displayId = `PROP${String(property.id).padStart(3, '0')}`;

        return {
            success: true,
            action: 'property_created',
            message: `✅ Propiedad registrada exitosamente\n\n📋 ID: ${displayId}\n🏠 ${property.nombre_propiedad}\n💰 ${property.precio} Bs`,
            data: property,
            templateId: 'property_created',
            templateData: {
                id: displayId,
                nombre: property.nombre_propiedad,
                ubicacion: property.ubicacion,
                precio: property.precio
            }
        };
    }

    // Handler: Actualizar Propiedad
    async handleUpdateProperty(commandData) {
        const params = commandData.command.parameters;

        if (!params.propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        const updates = params.updateData || {};
        const property = await this.propertyService.update(params.propertyId, updates);

        return {
            success: true,
            action: 'property_updated',
            message: `✅ Propiedad ${params.propertyId} actualizada correctamente`,
            data: property
        };
    }

    // Handler: Eliminar Propiedad
    async handleDeleteProperty(commandData) {
        const params = commandData.command.parameters;

        if (!params.propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        await this.propertyService.delete(params.propertyId);

        return {
            success: true,
            action: 'property_deleted',
            message: `✅ Propiedad ${params.propertyId} eliminada correctamente`,
            data: { propertyId: params.propertyId }
        };
    }

    // Handler: Listar Propiedades
    async handleListProperties(commandData) {
        const params = commandData.command.parameters;
        const filters = params.filters || {};
        const listMode = params.listMode || 'all'; // 'all' o 'my'

        // Si es "mis propiedades", filtrar por usuario_id
        if (listMode === 'my') {
            filters.usuario_id = commandData.user.id;
        }

        const properties = await this.propertyService.search(filters);

        if (properties.length === 0) {
            return {
                success: true,
                action: 'properties_listed',
                message: '📋 No se encontraron propiedades con los filtros especificados',
                data: []
            };
        }

        const listMessage = properties.slice(0, 10).map((p, i) =>
            `${i + 1}. 🏠 ${p.nombre_propiedad}\n   📍 ${p.ubicacion}\n   💰 ${p.precio} Bs`
        ).join('\n\n');

        return {
            success: true,
            action: 'properties_listed',
            message: `📊 **Propiedades disponibles (${properties.length}):**\n\n${listMessage}`,
            data: properties,
            templateId: 'search_results',
            templateData: {
                total: properties.length,
                propiedades: properties.map(p => ({
                    nombre: p.nombre_propiedad,
                    ubicacion: p.ubicacion,
                    precio: p.precio.toLocaleString(),
                    dormitorios: p.dormitorios,
                    banos: p.banos
                }))
            }
        };
    }

    // Handler: Ver Detalles de Propiedad
    async handlePropertyDetails(commandData) {
        const params = commandData.command.parameters;

        if (!params.propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        const property = await this.propertyService.getById(params.propertyId);

        if (!property) {
            throw new Error(`Propiedad ${params.propertyId} no encontrada`);
        }

        return {
            success: true,
            action: 'property_details',
            message: `🏠 **${property.nombre_propiedad}**\n\n📍 ${property.ubicacion}\n💰 ${property.precio} Bs\n📏 ${property.tamano}\n🛏️ ${property.dormitorios} dormitorios\n🚿 ${property.banos} baños\n\n📝 ${property.descripcion}`,
            data: property,
            templateId: 'property_info',
            templateData: property
        };
    }

    // Handler: Crear Cliente
    async handleCreateClient(commandData) {
        const params = commandData.command.parameters;
        const clientData = params.clientData || {};

        if (!clientData.telefono) {
            throw new Error('Teléfono del cliente requerido');
        }

        const client = await this.clientService.createOrUpdate({
            nombre: clientData.nombre || '',
            apellido: clientData.apellido || '',
            telefono: clientData.telefono,
            email: clientData.email || '',
            preferencias: clientData.preferencias || '',
            estado: 1
        });

        return {
            success: true,
            action: 'client_created',
            message: `✅ Cliente registrado exitosamente\n\n👤 ${client.nombre} ${client.apellido}\n📱 ${client.telefono}`,
            data: client
        };
    }

    // Handler: Actualizar Cliente
    async handleUpdateClient(commandData) {
        try {
            const params = commandData.command.parameters;
            const clientData = params.clientData || {};
            const updateMode = params.updateMode || 'single'; // 'single' o 'all'

            if (!clientData.telefono) {
                throw new Error('Teléfono del cliente requerido');
            }

            // Obtener cliente existente
            const existingClient = await this.clientService.getByPhone(clientData.telefono);
            if (!existingClient) {
                throw new Error('Cliente no encontrado');
            }

            // Si es modificación completa, validar campos requeridos
            if (updateMode === 'all' && (!clientData.nombre || !clientData.apellido || !clientData.email)) {
                throw new Error('Para modificación completa, se requieren: nombre, apellido y email');
            }

            // Preparar datos de actualización
            const updateData = {
                telefono: clientData.telefono,
                ...existingClient, // Mantener datos existentes
                ...(clientData.nombre && { nombre: clientData.nombre }),
                ...(clientData.apellido && { apellido: clientData.apellido }),
                ...(clientData.email && { email: clientData.email }),
                ...(clientData.preferencias && { preferencias: clientData.preferencias }),
                estado: clientData.estado !== undefined ? clientData.estado : existingClient.estado
            };

            const client = await this.clientService.update(clientData.telefono, updateData);

            return {
                success: true,
                action: 'client_updated',
                message: `✅ Cliente actualizado exitosamente\n\n👤 ${client.nombre} ${client.apellido}\n📱 ${client.telefono}${client.email ? '\n📧 ' + client.email : ''}${client.preferencias ? '\n🔍 Preferencias: ' + client.preferencias : ''}\n📋 Estado: ${client.estado === 1 ? 'Activo' : 'Inactivo'}`,
                data: client
            };
        } catch (error) {
            console.error('❌ Error actualizando cliente:', error.message);
            throw error;
        }
    }

    // Handler: Listar Clientes
    async handleListClients(commandData) {
        const clients = await this.clientService.list();

        if (clients.length === 0) {
            return {
                success: true,
                action: 'clients_listed',
                message: '📋 No hay clientes registrados',
                data: []
            };
        }

        const listMessage = clients.slice(0, 10).map((c, i) =>
            `${i + 1}. 👤 ${c.nombre} ${c.apellido}\n   📱 ${c.telefono}`
        ).join('\n\n');

        return {
            success: true,
            action: 'clients_listed',
            message: `📊 **Clientes registrados (${clients.length}):**\n\n${listMessage}`,
            data: clients
        };
    }

    async handleClientHistory(commandData) {
        const params = commandData.command.parameters;
        const telefono = params.telefono;

        const history = await this.clientService.getHistory(telefono);

        if (history.length === 0) {
            return {
                success: true,
                action: 'client_history',
                message: '📋 No hay historial para este cliente',
                data: []
            };
        }

        const historyMessage = history.slice(0, 10).map((h, i) =>
            `${i + 1}. 📅 ${h.fecha}\n   📝 ${h.mensaje}`
        ).join('\n\n');

        return {
            success: true,
            action: 'client_history',
            message: `📊 **Historial de ${telefono}:**\n\n${historyMessage}`,
            data: history
        };
    }

    // Handler: Crear Agente
    async handleCreateAgent(commandData) {
        const params = commandData.command.parameters;
        const agentData = params.agentData || {};

        if (!agentData.telefono) {
            throw new Error('Teléfono del agente requerido');
        }

        const agent = await this.userService.create({
            cargo_id: 1, // 1 = Agente
            nombre: agentData.nombre || '',
            apellido: agentData.apellido || '',
            telefono: agentData.telefono,
            estado: 1
        });

        return {
            success: true,
            action: 'agent_created',
            message: `✅ Agente registrado exitosamente\n\n👨‍💼 ${agent.nombre} ${agent.apellido}\n📱 ${agent.telefono}\n🆔 ID: ${agent.id}`,
            data: agent
        };
    }

    async handleUpdateAgent(commandData) {
        const params = commandData.command.parameters;
        const agentData = params.agentData || {};

        if (!agentData.telefono) {
            throw new Error('Teléfono del agente requerido');
        }

        const agent = await this.userService.update(agentData.telefono, {
            nombre: agentData.nombre || '',
            apellido: agentData.apellido || '',
            telefono: agentData.telefono,
            estado: 1
        });

        return {
            success: true,
            action: 'agent_updated',
            message: `✅ Agente actualizado exitosamente\n\n👨‍💼 ${agent.nombre} ${agent.apellido}\n📱 ${agent.telefono}\n🆔 ID: ${agent.id}`,
            data: agent
        };
    }

    // Handler: Listar Agentes
    async handleListAgents(commandData) {
        const agents = await this.userService.list({ cargo: 'agente' });

        if (agents.length === 0) {
            return {
                success: true,
                action: 'agents_listed',
                message: '📋 No hay agentes registrados',
                data: []
            };
        }

        const listMessage = agents.slice(0, 10).map((a, i) =>
            `${i + 1}. 👨‍💼 ${a.nombre} ${a.apellido}\n   📱 ${a.telefono}\n   📊 Estado: ${a.estado === 1 ? 'Activo' : 'Inactivo'}`
        ).join('\n\n');

        return {
            success: true,
            action: 'agents_listed',
            message: `📊 **Agentes registrados (${agents.length}):**\n\n${listMessage}`,
            data: agents
        };
    }

    // Handler: Reporte Diario
    async handleDailyReport(commandData) {
        const params = commandData.command.parameters;
        const date = params.date || new Date().toISOString().split('T')[0];

        const report = await this.generateDailyReport(date);

        return {
            success: true,
            action: 'daily_report',
            message: report.message,
            data: report,
            templateId: 'daily_report',
            templateData: report.templateData
        };
    }

    // Handler: Reporte Mensual
    async handleMonthlyReport(commandData) {
        const params = commandData.command.parameters;
        const month = params.month || new Date().getMonth() + 1;
        const year = params.year || new Date().getFullYear();

        const report = await this.generateMonthlyReport(month, year);

        return {
            success: true,
            action: 'monthly_report',
            message: report.message,
            data: report
        };
    }

    // Handler: Ayuda
    async handleHelp(commandData) {
        const params = commandData.command.parameters;
        const topic = params.topic;

        if (topic && this.commands[topic]) {
            const cmd = this.commands[topic];
            return {
                success: true,
                action: 'help',
                message: `ℹ️ **${cmd.name}**\n\n${cmd.description}\n\n📝 Formato: ${cmd.format}\n💡 Ejemplo: ${cmd.example}`,
                data: cmd
            };
        }

        const userRole = commandData.user.role?.toLowerCase();
        const availableCommands = Object.entries(this.commands)
            .filter(([key, cmd]) => cmd.requiredRole.includes(userRole))
            .map(([key, cmd]) => `• ${cmd.format}`)
            .join('\n');

        return {
            success: true,
            action: 'help',
            message: `ℹ️ **Comandos disponibles para ${userRole}:**\n\n${availableCommands}\n\n💡 Escribe "AYUDA [comando]" para más detalles`,
            data: { commands: this.getAvailableCommands(userRole) }
        };
    }

    // ==================== MÉTODOS DE SOPORTE ====================

    // Generar reporte diario
    async generateDailyReport(date) {
        console.log('📊 Generando reporte diario para:', date);

        try {
            // Obtener estadísticas del día
            const stats = {
                properties: await this.propertyService.getDailyStats(date),
                clients: await this.clientService.getDailyStats(date),
                users: await this.userService.getDailyStats(date)
            };

            const message = `📊 **Reporte Diario - ${date}**

📈 **Resumen:**
• Propiedades nuevas: ${stats.properties.new || 0}
• Clientes registrados: ${stats.clients.new || 0}
• Consultas atendidas: ${stats.properties.queries || 0}
• Visitas agendadas: ${stats.properties.visits || 0}

🏆 **Top Propiedades:**
${stats.properties.top?.map((p, i) => `${i + 1}. ${p.nombre} - ${p.consultas} consultas`).join('\n') || 'Sin datos'}

👥 **Actividad de Agentes:**
${stats.users.agents?.map(a => `• ${a.nombre}: ${a.actividad} acciones`).join('\n') || 'Sin datos'}

¡Excelente trabajo equipo! 💪`;

            return {
                success: true,
                date,
                stats,
                message,
                templateData: {
                    fecha: date,
                    consultas: stats.properties.queries || 0,
                    propiedades_mostradas: stats.properties.shown || 0,
                    visitas: stats.properties.visits || 0,
                    nuevos_clientes: stats.clients.new || 0,
                    top_propiedades: stats.properties.top || [],
                    agentes: stats.users.agents || []
                }
            };

        } catch (error) {
            console.error('❌ Error generando reporte diario:', error.message);
            throw error;
        }
    }

    // Generar reporte mensual
    async generateMonthlyReport(month, year) {
        console.log(`📊 Generando reporte mensual: ${month}/${year}`);

        try {
            const stats = {
                properties: await this.propertyService.getMonthlyStats(month, year),
                clients: await this.clientService.getMonthlyStats(month, year),
                users: await this.userService.getMonthlyStats(month, year),
                revenue: await this.propertyService.getMonthlyRevenue(month, year)
            };

            const message = `📊 **Reporte Mensual - ${month}/${year}**

📈 **Resumen del Mes:**
• Total propiedades listadas: ${stats.properties.total || 0}
• Propiedades vendidas/alquiladas: ${stats.properties.sold || 0}
• Nuevos clientes: ${stats.clients.total || 0}
• Ingresos estimados: ${stats.revenue.total || 0} Bs

📊 **Métricas de Rendimiento:**
• Tasa de conversión: ${stats.properties.conversionRate || 0}%
• Tiempo promedio de venta: ${stats.properties.avgSaleTime || 0} días
• Satisfacción del cliente: ${stats.clients.satisfaction || 0}/5

🏆 **Agente del Mes:**
${stats.users.topAgent ? `${stats.users.topAgent.nombre} - ${stats.users.topAgent.ventas} ventas` : 'Por determinar'}

💡 **Recomendaciones:**
${this.generateRecommendations(stats)}`;

            return {
                success: true,
                month,
                year,
                stats,
                message
            };

        } catch (error) {
            console.error('❌ Error generando reporte mensual:', error.message);
            throw error;
        }
    }

    // Generar recomendaciones basadas en estadísticas
    generateRecommendations(stats) {
        const recommendations = [];

        if (stats.properties.conversionRate < 10) {
            recommendations.push('• Mejorar seguimiento a clientes interesados');
        }
        if (stats.properties.avgSaleTime > 60) {
            recommendations.push('• Revisar estrategia de precios');
        }
        if (stats.clients.satisfaction < 4) {
            recommendations.push('• Implementar programa de mejora en atención');
        }

        return recommendations.length > 0
            ? recommendations.join('\n')
            : '• Mantener el excelente trabajo actual';
    }

    // Enviar respuesta al usuario
    async sendResponse(user, result) {
        try {
            const responseData = {
                to: user.phone,
                message: result.message,
                templateId: result.templateId,
                templateData: result.templateData,
                responseType: 'system',
                source: 'backend'
            };

            const response = await axios.post(
                `${this.responsesUrl}/api/send/system`,
                responseData,
                { timeout: 10000 }
            );

            console.log('✅ Respuesta enviada al usuario');
            return response.data;

        } catch (error) {
            console.error('⚠️ Error enviando respuesta:', error.message);
            // No lanzar error para no interrumpir el flujo
        }
    }

    // Enviar respuesta de error al usuario
    async sendErrorResponse(user, errorMessage) {
        try {
            const responseData = {
                to: user.phone,
                message: `❌ **Error ejecutando comando**\n\n⚠️ ${errorMessage}\n\n💡 Escribe "AYUDA" para ver los comandos disponibles`,
                responseType: 'system',
                source: 'backend',
                templateId: 'command_error',
                templateData: {
                    error: errorMessage,
                    sugerencia: this.getSuggestion(errorMessage)
                }
            };

            await axios.post(
                `${this.responsesUrl}/api/send/system`,
                responseData,
                { timeout: 10000 }
            );

        } catch (error) {
            console.error('⚠️ Error enviando respuesta de error:', error.message);
        }
    }

    // Obtener sugerencia basada en el error
    getSuggestion(errorMessage) {
        if (errorMessage.includes('ID')) {
            return 'Verifica que el ID sea correcto. Usa "LISTAR" para ver IDs disponibles';
        }
        if (errorMessage.includes('permisos')) {
            return 'Contacta a tu supervisor si necesitas estos permisos';
        }
        if (errorMessage.includes('formato')) {
            return 'Revisa el formato del comando. Usa "AYUDA [comando]" para ver ejemplos';
        }
        if (errorMessage.includes('teléfono')) {
            return 'El teléfono debe tener 8 dígitos sin espacios';
        }
        return 'Verifica el comando e intenta nuevamente';
    }

    // Validar comando
    validateCommand(commandData) {
        const commandType = commandData.command?.type;
        const commandDef = this.commands[commandType];

        if (!commandDef) {
            return {
                valid: false,
                error: 'Comando no reconocido'
            };
        }

        const userRole = commandData.user?.role?.toLowerCase();
        if (!commandDef.requiredRole.includes(userRole)) {
            return {
                valid: false,
                error: 'Sin permisos para este comando'
            };
        }

        return {
            valid: true,
            command: commandDef
        };
    }

    // Obtener comandos disponibles para un rol
    getAvailableCommands(role = null) {
        return Object.entries(this.commands)
            .filter(([key, cmd]) => !role || cmd.requiredRole.includes(role))
            .map(([key, cmd]) => ({
                id: key,
                name: cmd.name,
                description: cmd.description,
                format: cmd.format,
                example: cmd.example,
                requiredRole: cmd.requiredRole
            }));
    }

    // Verificar salud del sistema
    async checkHealth() {
        const health = {
            database: false,
            responses: false,
            allConnected: false
        };

        // Verificar base de datos
        try {
            const response = await axios.get(`${this.databaseUrl}/api/health`, { timeout: 5000 });
            health.database = response.data.success === true;
        } catch (error) {
            console.error('⚠️ Base de datos no disponible');
        }

        // Verificar módulo de respuestas
        try {
            const response = await axios.get(`${this.responsesUrl}/api/health`, { timeout: 5000 });
            health.responses = response.data.success === true;
        } catch (error) {
            console.error('⚠️ Módulo de respuestas no disponible');
        }

        health.allConnected = health.database && health.responses;

        return health;
    }

    // Inicializar
    async initialize() {
        console.log('🔧 Inicializando procesador de comandos...');

        // Cargar configuraciones o datos iniciales si es necesario

        console.log('✅ Procesador de comandos listo');
    }

    // Actualizar estadísticas
    async updateStats() {
        // Aquí podrías guardar las estadísticas en base de datos
        console.log('📊 Actualizando estadísticas...');
    }

    // Obtener estadísticas
    getStats() {
        return {
            ...this.stats,
            commandTypes: Object.keys(this.commands).length,
            timestamp: new Date().toISOString()
        };
    }

    // Limpiar al cerrar
    async shutdown() {
        console.log('🛑 Cerrando procesador de comandos...');
        await this.updateStats();
        console.log('✅ Procesador de comandos cerrado');
    }
    // Handler: Adjuntar archivo a propiedad
    async handleAttachPropertyFile(commandData) {
        const params = commandData.command.parameters;
        const propertyId = params.propertyId;
        const fileData = params.fileData;
        const knowsProperty = params.knowsProperty;

        try {
            if (!fileData) {
                throw new Error('Archivo requerido');
            }

            // Si no conoce la propiedad, primero mostrar lista
            if (!knowsProperty) {
                const properties = await this.propertyService.search({ usuario_id: commandData.user.id });
                if (properties.length === 0) {
                    throw new Error('No tienes propiedades registradas');
                }

                return {
                    success: true,
                    action: 'property_list_for_attachment',
                    message: '📋 Selecciona la propiedad a la que quieres adjuntar el archivo:\n\n' +
                        properties.map((p, i) => `${i + 1}. 🏠 ${p.nombre_propiedad}`).join('\n'),
                    data: properties
                };
            }

            // Si tiene ID de propiedad, adjuntar archivo
            const attachment = await this.propertyService.attachFile(propertyId, fileData, commandData.user.id);

            return {
                success: true,
                action: 'property_file_attached',
                message: `✅ Archivo adjuntado correctamente a la propiedad ${propertyId}`,
                data: attachment
            };
        } catch (error) {
            throw new Error(`Error adjuntando archivo: ${error.message}`);
        }
    }
    // Handler: Buscar Propiedades
    async handleSearchProperties(commandData) {
        const params = commandData.command.parameters;
        const criteria = params.criteria || {};

        try {
            // Construir filtros
            const filters = {};

            if (criteria.tipo) {
                filters.tipo_propiedad = criteria.tipo;
            }

            if (criteria.precio) {
                const [min, max] = criteria.precio.split('-').map(Number);
                if (!isNaN(min)) filters.precio_min = min;
                if (!isNaN(max)) filters.precio_max = max;
            }

            if (criteria.dormitorios) {
                filters.dormitorios = parseInt(criteria.dormitorios);
            }

            if (criteria.banos) {
                filters.banos = parseInt(criteria.banos);
            }

            if (criteria.ubicacion) {
                filters.ubicacion = criteria.ubicacion;
            }

            // Realizar búsqueda
            const properties = await this.propertyService.search(filters);

            if (properties.length === 0) {
                return {
                    success: true,
                    action: 'properties_searched',
                    message: '📋 No se encontraron propiedades con los criterios especificados',
                    data: []
                };
            }

            // Formatear resultados
            const listMessage = properties.map((p, i) =>
                `${i + 1}. 🏠 ${p.nombre_propiedad}\n   📍 ${p.ubicacion}\n   💰 ${p.precio} Bs\n   🛏️ ${p.dormitorios} dorm. 🚿 ${p.banos} baños`
            ).join('\n\n');

            return {
                success: true,
                action: 'properties_searched',
                message: `🔍 **Resultados de búsqueda (${properties.length}):**\n\n${listMessage}`,
                data: properties,
                templateId: 'search_results',
                templateData: {
                    total: properties.length,
                    propiedades: properties
                }
            };

        } catch (error) {
            throw new Error(`Error en la búsqueda: ${error.message}`);
        }
    }

    // Handler: Envío masivo de mensajes
    async handleBroadcastMessage(commandData) {
        try {
            const params = commandData.command.parameters;
            const grupo = params.grupo?.toLowerCase();
            const mensaje = params.mensaje;

            if (!grupo || !mensaje) {
                throw new Error('Se requiere especificar el grupo y el mensaje');
            }

            let recipients = [];
            
            // Obtener lista de destinatarios según el grupo
            switch (grupo) {
                case 'clientes':
                    recipients = await this.clientService.list({ estado: 1 });
                    break;
                case 'agentes':
                    recipients = await this.userService.list({ cargo: 'agente', estado: 1 });
                    break;
                default:
                    throw new Error('Grupo no válido. Use "clientes" o "agentes"');
            }

            if (recipients.length === 0) {
                throw new Error('No se encontraron destinatarios en el grupo especificado');
            }

            // Preparar respuesta para el usuario
            const responseData = {
                success: true,
                action: 'broadcast_sent',
                message: `✅ Mensaje enviado a ${recipients.length} destinatarios del grupo "${grupo}"\n\n📝 Mensaje:\n${mensaje}`,
                data: {
                    group: grupo,
                    recipients: recipients.length,
                    message: mensaje
                }
            };

            // Enviar el mensaje a cada destinatario
            const sendPromises = recipients.map(recipient => {
                return this.sendResponse({
                    phone: recipient.telefono,
                    role: 'recipient'
                }, {
                    message: mensaje,
                    responseType: 'broadcast',
                    source: 'backend'
                });
            });

            await Promise.all(sendPromises);

            return responseData;

        } catch (error) {
            console.error('❌ Error en envío masivo:', error.message);
            throw error;
        }
    }
}

module.exports = CommandProcessor;