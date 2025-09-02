// servidor/modulo-procesamiento/src/services/menuManager.js

class MenuManager {
    constructor() {
        // Estado de sesiones de menú por usuario
        this.userSessions = new Map();
        this.sessionTimeout = 30 * 60 * 1000; // 30 minutos
        
        // Definición de menús
        this.menus = this.defineMenus();
    }

    defineMenus() {
        return {
            MAIN: {
                title: '📋 *MENÚ PRINCIPAL - RE/MAX Express*',
                options: [
                    { id: '1', label: 'Gestionar Clientes', next: 'CLIENTS', requiredRole: ['agente', 'gerente'] },
                    { id: '2', label: 'Gestionar Propiedades', next: 'PROPERTIES', requiredRole: ['agente', 'gerente'] },
                    { id: '3', label: 'Envío Masivo', next: 'BROADCAST', requiredRole: ['agente', 'gerente'] },
                    { id: '4', label: 'Gestionar Agentes/Gerentes', next: 'AGENTS', requiredRole: ['gerente'] }
                ],
                footer: '\nResponde con el número de tu elección.'
            },
            
            CLIENTS: {
                title: '👥 *GESTIÓN DE CLIENTES*',
                options: [
                    { id: '1', label: 'Agregar Cliente', action: 'ADD_CLIENT' },
                    { id: '2', label: 'Modificar Cliente', action: 'MODIFY_CLIENT' },
                    { id: '3', label: 'Ver Todos los Clientes', action: 'LIST_CLIENTS' },
                    { id: '0', label: 'Volver al Menú Principal', next: 'MAIN' }
                ]
            },
            
            PROPERTIES: {
                title: '🏠 *GESTIÓN DE PROPIEDADES*',
                options: [
                    { id: '1', label: 'Agregar Propiedad', action: 'ADD_PROPERTY' },
                    { id: '2', label: 'Modificar Propiedad', action: 'MODIFY_PROPERTY' },
                    { id: '3', label: 'Agregar Archivo a Propiedad', action: 'ADD_FILE' },
                    { id: '4', label: 'Buscar Propiedades', action: 'SEARCH_PROPERTIES' },
                    { id: '5', label: 'Mis Propiedades', action: 'MY_PROPERTIES' },
                    { id: '0', label: 'Volver al Menú Principal', next: 'MAIN' }
                ]
            },
            
            BROADCAST: {
                title: '📢 *ENVÍO MASIVO*',
                options: [
                    { id: '1', label: 'Enviar a Todos los Clientes', action: 'BROADCAST_CLIENTS' },
                    { id: '2', label: 'Enviar a Clientes Filtrados', action: 'BROADCAST_FILTERED' },
                    { id: '3', label: 'Enviar a Agentes', action: 'BROADCAST_AGENTS', requiredRole: ['gerente'] },
                    { id: '0', label: 'Volver al Menú Principal', next: 'MAIN' }
                ]
            },
            
            AGENTS: {
                title: '👨‍💼 *GESTIÓN DE AGENTES/GERENTES*',
                options: [
                    { id: '1', label: 'Agregar Agente/Gerente', action: 'ADD_AGENT' },
                    { id: '2', label: 'Modificar Agente/Gerente', action: 'MODIFY_AGENT' },
                    { id: '3', label: 'Dar de Baja/Alta', action: 'TOGGLE_AGENT' },
                    { id: '4', label: 'Ver Todos los Agentes', action: 'LIST_AGENTS' },
                    { id: '0', label: 'Volver al Menú Principal', next: 'MAIN' }
                ],
                requiredRole: ['gerente']
            }
        };
    }

    // Obtener o crear sesión de usuario
    getSession(userId) {
        let session = this.userSessions.get(userId);
        
        if (!session) {
            session = {
                userId,
                currentMenu: 'MAIN',
                currentAction: null,
                actionStep: null,
                actionData: {},
                lastActivity: new Date(),
                history: []
            };
            this.userSessions.set(userId, session);
        } else {
            // Verificar timeout
            if (Date.now() - session.lastActivity > this.sessionTimeout) {
                // Sesión expirada, reiniciar
                session.currentMenu = 'MAIN';
                session.currentAction = null;
                session.actionStep = null;
                session.actionData = {};
                session.history = [];
            }
            session.lastActivity = new Date();
        }
        
        return session;
    }

    // Procesar entrada del usuario
    async processInput(userId, userRole, input, userData) {
        const session = this.getSession(userId);
        
        console.log(`📱 Procesando entrada para ${userId}: "${input}"`);
        console.log(`   Estado actual: Menu=${session.currentMenu}, Action=${session.currentAction}`);

        // Si hay una acción en progreso, procesarla
        if (session.currentAction) {
            return await this.processActionStep(session, userRole, input, userData);
        }

        // Si es el comando "menu" o "0" desde cualquier lugar, volver al menú principal
        if (input.toLowerCase() === 'menu' || input === '0') {
            session.currentMenu = 'MAIN';
            session.currentAction = null;
            session.actionData = {};
            return this.displayMenu(session, userRole);
        }

        // Procesar selección de menú
        return this.processMenuSelection(session, userRole, input, userData);
    }

    // Procesar selección de menú
    processMenuSelection(session, userRole, input, userData) {
        const currentMenu = this.menus[session.currentMenu];
        
        if (!currentMenu) {
            session.currentMenu = 'MAIN';
            return this.displayMenu(session, userRole);
        }

        const selectedOption = currentMenu.options.find(opt => opt.id === input);
        
        if (!selectedOption) {
            return {
                success: false,
                message: `❌ Opción no válida. Por favor selecciona una opción del menú:\n\n${this.formatMenu(currentMenu, userRole)}`,
                showMenu: true
            };
        }

        // Verificar permisos
        if (selectedOption.requiredRole && !selectedOption.requiredRole.includes(userRole.toLowerCase())) {
            return {
                success: false,
                message: '🚫 No tienes permisos para acceder a esta opción.',
                showMenu: true,
                menu: this.formatMenu(currentMenu, userRole)
            };
        }

        // Si tiene una acción, iniciarla
        if (selectedOption.action) {
            session.currentAction = selectedOption.action;
            session.actionStep = 1;
            session.actionData = { userData };
            return this.startAction(session, userRole, selectedOption.action);
        }

        // Si tiene un siguiente menú, mostrarlo
        if (selectedOption.next) {
            session.currentMenu = selectedOption.next;
            session.history.push(session.currentMenu);
            return this.displayMenu(session, userRole);
        }

        return {
            success: false,
            message: '❌ Error procesando la opción seleccionada.'
        };
    }

    // Mostrar menú actual
    displayMenu(session, userRole) {
        const menu = this.menus[session.currentMenu];
        
        if (!menu) {
            return {
                success: false,
                message: '❌ Error mostrando el menú.'
            };
        }

        return {
            success: true,
            message: this.formatMenu(menu, userRole),
            menuId: session.currentMenu,
            showMenu: true
        };
    }

    // Formatear menú para mostrar
    formatMenu(menu, userRole) {
        let message = `${menu.title}\n\n`;
        
        menu.options.forEach(option => {
            // Solo mostrar opciones permitidas para el rol
            if (!option.requiredRole || option.requiredRole.includes(userRole.toLowerCase())) {
                message += `${option.id}. ${option.label}\n`;
            }
        });
        
        if (menu.footer) {
            message += menu.footer;
        }
        
        return message;
    }

    // Iniciar una acción específica
    async startAction(session, userRole, action) {
        console.log(`🎯 Iniciando acción: ${action}`);
        
        switch (action) {
            case 'ADD_CLIENT':
                return {
                    success: true,
                    message: '👤 *AGREGAR NUEVO CLIENTE*\n\nPor favor, ingresa el *nombre completo* del cliente:',
                    waitingFor: 'client_name'
                };

            case 'MODIFY_CLIENT':
                return {
                    success: true,
                    message: '✏️ *MODIFICAR CLIENTE*\n\n¿Conoces el ID o teléfono del cliente?\n\n1. Sí, conozco el dato\n2. No, mostrar lista de clientes',
                    waitingFor: 'modify_client_choice'
                };

            case 'LIST_CLIENTS':
                session.currentAction = null; // Esta acción es inmediata
                return {
                    success: true,
                    message: '📋 Obteniendo lista de clientes...',
                    executeCommand: {
                        type: 'list_clients',
                        parameters: {}
                    }
                };

            case 'ADD_PROPERTY':
                return {
                    success: true,
                    message: '🏠 *AGREGAR NUEVA PROPIEDAD*\n\nIngresa el *nombre o título* de la propiedad:',
                    waitingFor: 'property_name'
                };

            case 'MODIFY_PROPERTY':
                return {
                    success: true,
                    message: '✏️ *MODIFICAR PROPIEDAD*\n\n¿Conoces el ID de la propiedad?\n\n1. Sí, conozco el ID\n2. No, mostrar mis propiedades',
                    waitingFor: 'modify_property_choice'
                };

            case 'SEARCH_PROPERTIES':
                return {
                    success: true,
                    message: '🔍 *BUSCAR PROPIEDADES*\n\nIngresa criterios de búsqueda:\n- Ubicación (ej: "Equipetrol")\n- Precio máximo (ej: "150000")\n- Tipo (casa/departamento/terreno)\n- O escribe "todas" para ver todo',
                    waitingFor: 'search_criteria'
                };

            case 'MY_PROPERTIES':
                session.currentAction = null;
                return {
                    success: true,
                    message: '📋 Obteniendo tus propiedades...',
                    executeCommand: {
                        type: 'list_properties',
                        parameters: {
                            filters: { usuario_id: session.actionData.userData.id }
                        }
                    }
                };

            case 'ADD_FILE':
                return {
                    success: true,
                    message: '📎 *AGREGAR ARCHIVO A PROPIEDAD*\n\nIngresa el ID de la propiedad:',
                    waitingFor: 'file_property_id'
                };

            case 'BROADCAST_CLIENTS':
                return {
                    success: true,
                    message: '📢 *ENVÍO MASIVO A CLIENTES*\n\nEscribe el mensaje que deseas enviar a todos los clientes:',
                    waitingFor: 'broadcast_message'
                };

            case 'ADD_AGENT':
                if (userRole.toLowerCase() !== 'gerente') {
                    session.currentAction = null;
                    return {
                        success: false,
                        message: '🚫 Solo los gerentes pueden agregar agentes.'
                    };
                }
                return {
                    success: true,
                    message: '👨‍💼 *AGREGAR NUEVO AGENTE/GERENTE*\n\nIngresa el *nombre completo*:',
                    waitingFor: 'agent_name'
                };

            case 'LIST_AGENTS':
                session.currentAction = null;
                return {
                    success: true,
                    message: '📋 Obteniendo lista de agentes...',
                    executeCommand: {
                        type: 'list_agents',
                        parameters: {}
                    }
                };

            case 'TOGGLE_AGENT':
                return {
                    success: true,
                    message: '🔄 *DAR DE BAJA/ALTA AGENTE*\n\n¿Conoces el ID o teléfono del agente?\n\n1. Sí, conozco el dato\n2. No, mostrar lista de agentes',
                    waitingFor: 'toggle_agent_choice'
                };

            default:
                session.currentAction = null;
                return {
                    success: false,
                    message: '❌ Acción no reconocida.'
                };
        }
    }

    // Procesar pasos de una acción
    async processActionStep(session, userRole, input, userData) {
        const action = session.currentAction;
        
        console.log(`⚙️ Procesando paso de acción: ${action}, Step: ${session.actionStep}`);
        
        // Cancelar acción
        if (input.toLowerCase() === 'cancelar' || input === '0') {
            session.currentAction = null;
            session.actionStep = null;
            session.actionData = {};
            return this.displayMenu(session, userRole);
        }

        switch (action) {
            case 'ADD_CLIENT':
                return this.processAddClient(session, input);
            
            case 'MODIFY_CLIENT':
                return this.processModifyClient(session, input);
            
            case 'ADD_PROPERTY':
                return this.processAddProperty(session, input, userData);
            
            case 'MODIFY_PROPERTY':
                return this.processModifyProperty(session, input, userData);
            
            case 'SEARCH_PROPERTIES':
                return this.processSearchProperties(session, input);
            
            case 'ADD_FILE':
                return this.processAddFile(session, input);
            
            case 'BROADCAST_CLIENTS':
                return this.processBroadcastClients(session, input);
            
            case 'ADD_AGENT':
                return this.processAddAgent(session, input);
            
            case 'TOGGLE_AGENT':
                return this.processToggleAgent(session, input);
            
            default:
                session.currentAction = null;
                return {
                    success: false,
                    message: '❌ Error procesando la acción.'
                };
        }
    }

    // Procesar agregar cliente
    processAddClient(session, input) {
        switch (session.actionStep) {
            case 1: // Nombre
                session.actionData.nombre = input;
                session.actionStep = 2;
                return {
                    success: true,
                    message: '📱 Ahora ingresa el *número de teléfono* del cliente (sin espacios):',
                    waitingFor: 'client_phone'
                };
            
            case 2: // Teléfono
                // Validar formato de teléfono
                const phone = input.replace(/\D/g, '');
                if (phone.length < 8) {
                    return {
                        success: false,
                        message: '❌ Número de teléfono inválido. Debe tener al menos 8 dígitos.\n\nIngresa nuevamente:',
                        waitingFor: 'client_phone'
                    };
                }
                
                session.actionData.telefono = phone;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '📧 Ingresa el *email* del cliente (o escribe "no" si no tiene):',
                    waitingFor: 'client_email'
                };
            
            case 3: // Email
                if (input.toLowerCase() !== 'no') {
                    session.actionData.email = input;
                }
                session.actionStep = 4;
                return {
                    success: true,
                    message: '🏠 ¿Qué tipo de propiedad busca? (casa/departamento/terreno/oficina o "no sé"):',
                    waitingFor: 'client_preferences'
                };
            
            case 4: // Preferencias
                if (input.toLowerCase() !== 'no sé') {
                    session.actionData.preferencias = input;
                }
                
                // Ejecutar comando
                session.currentAction = null;
                return {
                    success: true,
                    message: '✅ Registrando cliente...',
                    executeCommand: {
                        type: 'create_client',
                        parameters: {
                            clientData: {
                                nombre: session.actionData.nombre,
                                apellido: '', // Separar si es necesario
                                telefono: session.actionData.telefono,
                                email: session.actionData.email || '',
                                preferencias: session.actionData.preferencias || ''
                            }
                        }
                    }
                };
        }
    }

    // Procesar modificar cliente
    async processModifyClient(session, input) {
        switch (session.actionStep) {
            case 1: // Elección inicial
                if (input === '1') {
                    session.actionStep = 2;
                    return {
                        success: true,
                        message: '🔍 Ingresa el ID o teléfono del cliente:',
                        waitingFor: 'client_identifier'
                    };
                } else if (input === '2') {
                    session.currentAction = null;
                    return {
                        success: true,
                        message: '📋 Obteniendo lista de clientes...',
                        executeCommand: {
                            type: 'list_clients',
                            parameters: { forSelection: true }
                        }
                    };
                }
                break;
            
            case 2: // ID o teléfono ingresado
                session.actionData.clientIdentifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Teléfono\n3. Email\n4. Preferencias\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
                };
            
            case 3: // Campo a modificar
                const fields = { '1': 'nombre', '2': 'telefono', '3': 'email', '4': 'preferencias' };
                session.actionData.fieldToModify = fields[input];
                
                if (!session.actionData.fieldToModify) {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona 1, 2, 3 o 4:',
                        waitingFor: 'modify_field'
                    };
                }
                
                session.actionStep = 4;
                return {
                    success: true,
                    message: `📝 Ingresa el nuevo valor para ${session.actionData.fieldToModify}:`,
                    waitingFor: 'new_value'
                };
            
            case 4: // Nuevo valor
                session.actionData.newValue = input;
                session.currentAction = null;
                
                return {
                    success: true,
                    message: '✅ Actualizando cliente...',
                    executeCommand: {
                        type: 'update_client',
                        parameters: {
                            identifier: session.actionData.clientIdentifier,
                            field: session.actionData.fieldToModify,
                            value: session.actionData.newValue
                        }
                    }
                };
        }
    }

    // Procesar agregar propiedad
    processAddProperty(session, input, userData) {
        switch (session.actionStep) {
            case 1: // Nombre
                session.actionData.nombre_propiedad = input;
                session.actionStep = 2;
                return {
                    success: true,
                    message: '📍 Ingresa la *ubicación* de la propiedad:',
                    waitingFor: 'property_location'
                };
            
            case 2: // Ubicación
                session.actionData.ubicacion = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '💰 Ingresa el *precio* en Bolivianos (solo números):',
                    waitingFor: 'property_price'
                };
            
            case 3: // Precio
                const price = parseInt(input.replace(/\D/g, ''));
                if (isNaN(price) || price <= 0) {
                    return {
                        success: false,
                        message: '❌ Precio inválido. Ingresa solo números:',
                        waitingFor: 'property_price'
                    };
                }
                session.actionData.precio = price;
                session.actionStep = 4;
                return {
                    success: true,
                    message: '🏠 Tipo de propiedad:\n1. Casa\n2. Departamento\n3. Terreno\n4. Oficina\n5. Local\n\nSelecciona:',
                    waitingFor: 'property_type'
                };
            
            case 4: // Tipo
                const types = { '1': 'casa', '2': 'departamento', '3': 'terreno', '4': 'oficina', '5': 'local' };
                session.actionData.tipo_propiedad = types[input] || 'casa';
                session.actionStep = 5;
                return {
                    success: true,
                    message: '📏 Ingresa el *tamaño* (ej: "200 m²" o solo "200"):',
                    waitingFor: 'property_size'
                };
            
            case 5: // Tamaño
                session.actionData.tamano = input;
                session.actionStep = 6;
                return {
                    success: true,
                    message: '🛏️ Número de *dormitorios* (0 si no aplica):',
                    waitingFor: 'property_bedrooms'
                };
            
            case 6: // Dormitorios
                session.actionData.dormitorios = parseInt(input) || 0;
                session.actionStep = 7;
                return {
                    success: true,
                    message: '🚿 Número de *baños* (0 si no aplica):',
                    waitingFor: 'property_bathrooms'
                };
            
            case 7: // Baños
                session.actionData.banos = parseInt(input) || 0;
                session.actionStep = 8;
                return {
                    success: true,
                    message: '📝 Agrega una *descripción* de la propiedad:',
                    waitingFor: 'property_description'
                };
            
            case 8: // Descripción
                session.actionData.descripcion = input;
                session.currentAction = null;
                
                return {
                    success: true,
                    message: '✅ Registrando propiedad...',
                    executeCommand: {
                        type: 'create_property',
                        parameters: {
                            propertyData: {
                                ...session.actionData,
                                usuario_id: userData.id
                            }
                        }
                    }
                };
        }
    }

    // Procesar búsqueda de propiedades
    processSearchProperties(session, input) {
        session.currentAction = null;
        
        let filters = {};
        
        if (input.toLowerCase() === 'todas') {
            // Buscar todas
        } else {
            // Parsear criterios de búsqueda
            const lowerInput = input.toLowerCase();
            
            // Detectar precio
            const priceMatch = input.match(/(\d+)/);
            if (priceMatch) {
                filters.precio_max = parseInt(priceMatch[1]);
            }
            
            // Detectar tipo
            if (lowerInput.includes('casa')) filters.tipo_propiedad = 'casa';
            else if (lowerInput.includes('depart')) filters.tipo_propiedad = 'departamento';
            else if (lowerInput.includes('terreno')) filters.tipo_propiedad = 'terreno';
            else if (lowerInput.includes('oficina')) filters.tipo_propiedad = 'oficina';
            
            // Detectar ubicación (si no es precio ni tipo)
            if (!priceMatch && !filters.tipo_propiedad) {
                filters.ubicacion = input;
            }
        }
        
        return {
            success: true,
            message: '🔍 Buscando propiedades...',
            executeCommand: {
                type: 'search_properties',
                parameters: { filters }
            }
        };
    }

    // Procesar agregar agente
    processAddAgent(session, input) {
        switch (session.actionStep) {
            case 1: // Nombre
                session.actionData.nombre = input;
                session.actionStep = 2;
                return {
                    success: true,
                    message: '📱 Ingresa el *número de teléfono* del agente:',
                    waitingFor: 'agent_phone'
                };
            
            case 2: // Teléfono
                const phone = input.replace(/\D/g, '');
                if (phone.length < 8) {
                    return {
                        success: false,
                        message: '❌ Número inválido. Debe tener al menos 8 dígitos:',
                        waitingFor: 'agent_phone'
                    };
                }
                session.actionData.telefono = phone;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '👔 Selecciona el cargo:\n\n1. Agente\n2. Gerente',
                    waitingFor: 'agent_role'
                };
            
            case 3: // Cargo
                const cargo = input === '2' ? 2 : 1; // 1=Agente, 2=Gerente
                session.actionData.cargo_id = cargo;
                session.currentAction = null;
                
                return {
                    success: true,
                    message: '✅ Registrando agente/gerente...',
                    executeCommand: {
                        type: 'create_agent',
                        parameters: {
                            agentData: {
                                nombre: session.actionData.nombre,
                                apellido: '', // Separar si es necesario
                                telefono: session.actionData.telefono,
                                cargo_id: session.actionData.cargo_id
                            }
                        }
                    },
                    generateQR: true // Flag para generar QR después
                };
        }
    }

    // Procesar dar de baja/alta agente
    async processToggleAgent(session, input) {
        switch (session.actionStep) {
            case 1: // Elección inicial
                if (input === '1') {
                    session.actionStep = 2;
                    return {
                        success: true,
                        message: '🔍 Ingresa el ID o teléfono del agente:',
                        waitingFor: 'agent_identifier'
                    };
                } else if (input === '2') {
                    session.currentAction = null;
                    return {
                        success: true,
                        message: '📋 Obteniendo lista de agentes...',
                        executeCommand: {
                            type: 'list_agents',
                            parameters: { forSelection: true }
                        }
                    };
                }
                break;
            
            case 2: // Identificador
                session.actionData.identifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '🔄 ¿Qué acción deseas realizar?\n\n1. Dar de BAJA (desactivar)\n2. Dar de ALTA (activar)',
                    waitingFor: 'toggle_action'
                };
            
            case 3: // Acción
                const action = input === '1' ? 'deactivate' : 'activate';
                session.actionData.action = action;
                
                const confirmMsg = action === 'deactivate' 
                    ? '⚠️ CONFIRMA: Se cerrará la sesión del agente y no podrá acceder al sistema.\n\n1. Sí, dar de baja\n2. Cancelar'
                    : '✅ CONFIRMA: Se activará el agente y podrá acceder al sistema.\n\n1. Sí, dar de alta\n2. Cancelar';
                
                session.actionStep = 4;
                return {
                    success: true,
                    message: confirmMsg,
                    waitingFor: 'confirm_toggle'
                };
            
            case 4: // Confirmación
                if (input !== '1') {
                    session.currentAction = null;
                    return {
                        success: true,
                        message: '❌ Acción cancelada.',
                        showMenu: true
                    };
                }
                
                session.currentAction = null;
                return {
                    success: true,
                    message: '✅ Procesando cambio de estado...',
                    executeCommand: {
                        type: 'toggle_agent',
                        parameters: {
                            identifier: session.actionData.identifier,
                            action: session.actionData.action
                        }
                    },
                    generateQR: session.actionData.action === 'activate'
                };
        }
    }

    // Procesar broadcast a clientes
    processBroadcastClients(session, input) {
        session.actionData.message = input;
        session.currentAction = null;
        
        return {
            success: true,
            message: '📤 Preparando envío masivo...',
            executeCommand: {
                type: 'broadcast_clients',
                parameters: {
                    message: session.actionData.message,
                    filters: {}
                }
            }
        };
    }

    // Procesar agregar archivo
    processAddFile(session, input) {
        switch (session.actionStep) {
            case 1: // ID de propiedad
                session.actionData.propertyId = input;
                session.actionStep = 2;
                return {
                    success: true,
                    message: '📎 Envía la imagen o documento que deseas agregar a la propiedad:',
                    waitingFor: 'file_attachment',
                    expectsMedia: true
                };
            
            case 2: // Archivo recibido
                // Este paso se procesará cuando se reciba un archivo
                session.currentAction = null;
                return {
                    success: true,
                    message: '✅ Procesando archivo...',
                    executeCommand: {
                        type: 'add_property_file',
                        parameters: {
                            propertyId: session.actionData.propertyId,
                            fileData: input // Aquí vendría la info del archivo
                        }
                    }
                };
        }
    }

    // Limpiar sesiones expiradas
    cleanupSessions() {
        const now = Date.now();
        for (const [userId, session] of this.userSessions.entries()) {
            if (now - session.lastActivity > this.sessionTimeout) {
                this.userSessions.delete(userId);
                console.log(`🗑️ Sesión expirada eliminada: ${userId}`);
            }
        }
    }

    // Obtener estadísticas
    getStats() {
        return {
            activeSessions: this.userSessions.size,
            sessions: Array.from(this.userSessions.entries()).map(([userId, session]) => ({
                userId,
                currentMenu: session.currentMenu,
                currentAction: session.currentAction,
                lastActivity: session.lastActivity
            }))
        };
    }
}

module.exports = MenuManager;