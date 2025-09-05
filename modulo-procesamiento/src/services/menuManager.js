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
                    message: '👤 *AGREGAR NUEVO CLIENTE*\n\nPor favor, ingresa el *nombre* del cliente:',
                    waitingFor: 'client_name'
                };

            case 'MODIFY_CLIENT':
                return {
                    success: true,
                    message: '✏️ *MODIFICAR CLIENTE*\n\n¿Conoces el teléfono o ID del cliente?\n\n1. Sí, conozco el teléfono o ID\n2. No, mostrar lista de clientes',
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
                    message: '🔍 *BUSCAR PROPIEDADES*\n\n¿Qué filtro quieres usar?\n\n1. Ver todas las propiedades del sistema\n2. Filtrar por precio máximo\n3. Filtrar por ubicación\n4. Filtrar por tipo de propiedad\n5. Búsqueda personalizada\n\nSelecciona una opción:',
                    waitingFor: 'search_filter_choice'
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
                    message: '📎 *AGREGAR ARCHIVO A PROPIEDAD*\n\n¿Conoces el ID de la propiedad?\n\n1. Sí, conozco el ID\n2. No, mostrar mis propiedades',
                    waitingFor: 'add_file_choice'
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
                    message: '👨‍💼 *AGREGAR NUEVO AGENTE/GERENTE*\n\nIngresa el *nombre*:',
                    waitingFor: 'agent_name'
                };

            case 'MODIFY_AGENT':
                if (userRole.toLowerCase() !== 'gerente') {
                    session.currentAction = null;
                    return {
                        success: false,
                        message: '🚫 Solo los gerentes pueden modificar agentes.'
                    };
                }
                return {
                    success: true,
                    message: '✏️ *MODIFICAR AGENTE/GERENTE*\n\n¿Conoces el ID o teléfono del agente?\n\n1. Sí, conozco el dato\n2. No, mostrar lista de agentes',
                    waitingFor: 'modify_agent_choice'
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
                return this.processSearchProperties(session, input, userData);
            
            case 'ADD_FILE':
                return this.processAddFile(session, input, userData);
            
            case 'BROADCAST_CLIENTS':
                return this.processBroadcastClients(session, input);
            
            case 'ADD_AGENT':
                return this.processAddAgent(session, input);
            
            case 'MODIFY_AGENT':
                return this.processModifyAgent(session, input);
            
            case 'TOGGLE_AGENT':
                return this.processToggleAgent(session, input);
            
            case 'LIST_AGENTS':
                // LIST_AGENTS no necesita procesamiento, es inmediato
                session.currentAction = null;
                return {
                    success: true,
                    message: '📋 Obteniendo lista de agentes...',
                    executeCommand: {
                        type: 'list_agents',
                        parameters: {}
                    }
                };
            
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
                    message: '👤 Ahora ingresa el *apellido* del cliente:',
                    waitingFor: 'client_apellido'
                };
            
            case 2: // Apellido
                session.actionData.apellido = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '📱 Ahora ingresa el *número de teléfono* del cliente con código de país (ej.: 59171234567):',
                    waitingFor: 'client_phone'
                };
            
            case 3: // Teléfono
                // Validar formato de teléfono
                const phone = input.replace(/\D/g, '');
                if (phone.length < 10 || !phone.startsWith('591')) {
                    return {
                        success: false,
                        message: '❌ Número de teléfono inválido. Debe incluir el código de país (ej.: 59171234567).\n\nIngresa nuevamente:',
                        waitingFor: 'client_phone'
                    };
                }
                
                session.actionData.telefono = phone;
                session.actionStep = 4;
                return {
                    success: true,
                    message: '📧 Ingresa el *email* del cliente (o escribe "no" si no tiene):',
                    waitingFor: 'client_email'
                };
            
            case 4: // Email
                if (input.toLowerCase() !== 'no') {
                    session.actionData.email = input;
                }
                
                // Ejecutar comando directamente sin preferencias
                session.currentAction = null;
                return {
                    success: true,
                    message: '✅ Registrando cliente...',
                    executeCommand: {
                        type: 'create_client',
                        parameters: {
                            clientData: {
                                nombre: session.actionData.nombre,
                                apellido: session.actionData.apellido,
                                telefono: session.actionData.telefono,
                                email: session.actionData.email || ''
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
                    session.actionStep = 10; // Paso especial para después de mostrar lista
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
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Apellido\n3. Teléfono\n4. Email\n5. Modificar todo\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
                };
            
            case 3: // Campo a modificar
                if (input === '5') {
                    // Modificar todo
                    session.actionData.modifyAll = true;
                    session.actionStep = 5; // Ir al flujo de modificar todo
                    return {
                        success: true,
                        message: '📝 *MODIFICAR TODOS LOS DATOS*\n\nIngresa el nuevo *nombre*:',
                        waitingFor: 'modify_all_nombre'
                    };
                }
                
                const fields = { '1': 'nombre', '2': 'apellido', '3': 'telefono', '4': 'email' };
                session.actionData.fieldToModify = fields[input];
                
                if (!session.actionData.fieldToModify) {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona 1, 2, 3, 4 o 5:',
                        waitingFor: 'modify_field'
                    };
                }
                
                session.actionStep = 4;
                return {
                    success: true,
                    message: `📝 Ingresa el nuevo valor para ${session.actionData.fieldToModify}:`,
                    waitingFor: 'new_value'
                };
            
            case 4: // Nuevo valor (modificación individual)
                session.actionData.newValue = input;
                session.currentAction = null;
                
                // Crear objeto con el campo específico a actualizar
                const updateData = {
                    telefono: session.actionData.clientIdentifier // Este es el identificador del cliente
                };
                
                // Si estamos modificando el teléfono, validarlo
                if (session.actionData.fieldToModify === 'telefono') {
                    const newPhone = input.replace(/\D/g, '');
                    if (newPhone.length < 10 || !newPhone.startsWith('591')) {
                        return {
                            success: false,
                            message: '❌ Número de teléfono inválido. Debe incluir el código de país (ej.: 59171234567).\n\nIngresa nuevamente:',
                            waitingFor: 'new_value'
                        };
                    }
                    updateData.newTelefono = newPhone; // Campo especial para nuevo teléfono
                } else {
                    updateData[session.actionData.fieldToModify] = session.actionData.newValue;
                }
                
                return {
                    success: true,
                    message: '✅ Actualizando cliente...',
                    executeCommand: {
                        type: 'update_client',
                        parameters: {
                            clientData: updateData
                        }
                    }
                };
            
            case 5: // Modificar todo - Nombre
                session.actionData.newNombre = input;
                session.actionStep = 6;
                return {
                    success: true,
                    message: '📝 Ingresa el nuevo *apellido*:',
                    waitingFor: 'modify_all_apellido'
                };
            
            case 6: // Modificar todo - Apellido
                session.actionData.newApellido = input;
                session.actionStep = 7;
                return {
                    success: true,
                    message: '📝 Ingresa el nuevo *teléfono* con código de país (ej.: 59171234567):',
                    waitingFor: 'modify_all_telefono'
                };
            
            case 7: // Modificar todo - Teléfono
                const newPhone = input.replace(/\D/g, '');
                if (newPhone.length < 10 || !newPhone.startsWith('591')) {
                    return {
                        success: false,
                        message: '❌ Número de teléfono inválido. Debe incluir el código de país (ej.: 59171234567).\n\nIngresa nuevamente:',
                        waitingFor: 'modify_all_telefono'
                    };
                }
                
                session.actionData.newTelefono = newPhone;
                session.actionStep = 8;
                return {
                    success: true,
                    message: '📝 Ingresa el nuevo *email* (o escribe "no" si no tiene):',
                    waitingFor: 'modify_all_email'
                };
            
            case 8: // Modificar todo - Email
                session.actionData.newEmail = input.toLowerCase() === 'no' ? '' : input;
                session.currentAction = null;
                
                return {
                    success: true,
                    message: '✅ Actualizando todos los datos del cliente...',
                    executeCommand: {
                        type: 'update_client',
                        parameters: {
                            updateType: 'todo',
                            clientData: {
                                telefono: session.actionData.clientIdentifier, // Identificador del cliente
                                nombre: session.actionData.newNombre,
                                apellido: session.actionData.newApellido,
                                email: session.actionData.newEmail,
                                newTelefono: session.actionData.newTelefono // Nuevo teléfono
                            }
                        }
                    }
                };
            
            case 10: // ID o teléfono después de mostrar lista
                session.actionData.clientIdentifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Apellido\n3. Teléfono\n4. Email\n5. Modificar todo\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
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
                    message: '📏 Ingresa la *superficie* (ej: "200 m²" o solo "200"):',
                    waitingFor: 'property_surface'
                };
            
            case 5: // Superficie
                session.actionData.superficie = input;
                session.actionStep = 6;
                return {
                    success: true,
                    message: '📐 Ingresa las *dimensiones* (ej: "10x15 metros", opcional):',
                    waitingFor: 'property_dimensions'
                };
            
            case 6: // Dimensiones
                session.actionData.dimensiones = input.trim() || null;
                session.actionStep = 7;
                return {
                    success: true,
                    message: '📝 Agrega una *descripción* de la propiedad:',
                    waitingFor: 'property_description'
                };
            
            case 7: // Descripción
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
    processSearchProperties(session, input, userData) {
        switch (session.actionStep) {
            case 1: // Elección inicial de filtro
                session.actionData.searchType = input;
                
                switch (input) {
                    case '1': // Ver todas las propiedades del sistema
                        session.currentAction = null;
                        return {
                            success: true,
                            message: '🔍 Cargando todas las propiedades del sistema...',
                            executeCommand: {
                                type: 'search_properties',
                                parameters: { filters: {} }
                            }
                        };
                    
                    case '2': // Filtrar por precio máximo
                        session.actionStep = 2;
                        return {
                            success: true,
                            message: '💰 Ingresa el precio máximo en Bolivianos:',
                            waitingFor: 'price_max'
                        };
                    
                    case '3': // Filtrar por ubicación
                        session.actionStep = 3;
                        return {
                            success: true,
                            message: '📍 Ingresa la ubicación que buscas:',
                            waitingFor: 'location'
                        };
                    
                    case '4': // Filtrar por tipo
                        session.actionStep = 4;
                        return {
                            success: true,
                            message: '🏠 Tipo de propiedad:\n\n1. Casa\n2. Departamento\n3. Terreno\n4. Oficina\n5. Local\n\nSelecciona:',
                            waitingFor: 'property_type'
                        };
                    
                    case '5': // Búsqueda personalizada
                        session.actionStep = 5;
                        return {
                            success: true,
                            message: '📝 Escribe tus criterios de búsqueda:\n- "casa zona norte"\n- "departamento precio 200000"\n- "terreno"\n\nIngresa tus criterios:',
                            waitingFor: 'custom_search'
                        };
                    
                    default:
                        return {
                            success: false,
                            message: '❌ Opción no válida. Selecciona del 1 al 5:',
                            waitingFor: 'search_filter_choice'
                        };
                }
                break;
            
            case 2: // Precio máximo
                const priceMax = parseInt(input.replace(/\D/g, ''));
                if (isNaN(priceMax) || priceMax <= 0) {
                    return {
                        success: false,
                        message: '❌ Precio inválido. Ingresa solo números:',
                        waitingFor: 'price_max'
                    };
                }
                session.currentAction = null;
                return {
                    success: true,
                    message: `🔍 Buscando propiedades con precio máximo ${priceMax.toLocaleString()} Bs...`,
                    executeCommand: {
                        type: 'search_properties',
                        parameters: { filters: { precio_max: priceMax } }
                    }
                };
            
            case 3: // Ubicación
                session.currentAction = null;
                return {
                    success: true,
                    message: `🔍 Buscando propiedades en ${input}...`,
                    executeCommand: {
                        type: 'search_properties',
                        parameters: { filters: { ubicacion: input } }
                    }
                };
            
            case 4: // Tipo de propiedad
                const types = { '1': 'casa', '2': 'departamento', '3': 'terreno', '4': 'oficina', '5': 'local' };
                const selectedType = types[input];
                if (!selectedType) {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona del 1 al 5:',
                        waitingFor: 'property_type'
                    };
                }
                session.currentAction = null;
                return {
                    success: true,
                    message: `🔍 Buscando ${selectedType}s...`,
                    executeCommand: {
                        type: 'search_properties',
                        parameters: { filters: { tipo_propiedad: selectedType } }
                    }
                };
            
            case 5: // Búsqueda personalizada
                session.currentAction = null;
                
                const lowerInput = input.toLowerCase();
                let filters = {};
                
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
                
                return {
                    success: true,
                    message: '🔍 Buscando propiedades con criterio personalizado...',
                    executeCommand: {
                        type: 'search_properties',
                        parameters: { filters, searchText: input }
                    }
                };
        }
    }

    // Procesar modificar propiedad
    processModifyProperty(session, input, userData) {
        switch (session.actionStep) {
            case 1: // Elección inicial
                if (input === '1') {
                    session.actionStep = 2;
                    return {
                        success: true,
                        message: '🔍 Ingresa el ID de la propiedad:',
                        waitingFor: 'property_id'
                    };
                } else if (input === '2') {
                    session.actionStep = 10; // Paso especial para después de mostrar lista
                    return {
                        success: true,
                        message: '📋 Obteniendo tus propiedades...',
                        executeCommand: {
                            type: 'list_properties',
                            parameters: { 
                                forSelection: true,
                                filters: { usuario_id: userData.id }
                            }
                        }
                    };
                } else {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona 1 o 2:',
                        waitingFor: 'modify_property_choice'
                    };
                }
                break;
            
            case 2: // ID ingresado directamente
                session.actionData.propertyId = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Ubicación\n3. Precio\n4. Descripción\n5. Tipo de propiedad\n6. Superficie\n7. Dimensiones\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
                };
            
            case 3: // Campo a modificar
                const fields = {
                    '1': 'nombre_propiedad',
                    '2': 'ubicacion', 
                    '3': 'precio',
                    '4': 'descripcion',
                    '5': 'tipo_propiedad',
                    '6': 'superficie',
                    '7': 'dimensiones'
                };
                
                session.actionData.fieldToModify = fields[input];
                
                if (!session.actionData.fieldToModify) {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona del 1 al 7:',
                        waitingFor: 'modify_field'
                    };
                }
                
                session.actionStep = 4;
                let fieldName = {
                    'nombre_propiedad': 'nombre',
                    'ubicacion': 'ubicación',
                    'precio': 'precio',
                    'descripcion': 'descripción',
                    'tipo_propiedad': 'tipo de propiedad',
                    'superficie': 'superficie',
                    'dimensiones': 'dimensiones'
                }[session.actionData.fieldToModify];
                
                return {
                    success: true,
                    message: `📝 Ingresa el nuevo ${fieldName}:`,
                    waitingFor: 'new_value'
                };
            
            case 4: // Nuevo valor
                session.actionData.newValue = input;
                session.currentAction = null;
                
                // Validación específica según el campo
                let validatedValue = input;
                if (session.actionData.fieldToModify === 'precio') {
                    const price = parseInt(input.replace(/\D/g, ''));
                    if (isNaN(price) || price < 0) {
                        return {
                            success: false,
                            message: '❌ Precio inválido. Ingresa solo números:',
                            waitingFor: 'new_value'
                        };
                    }
                    validatedValue = price;
                // Campos de superficie y dimensiones son texto libre
                } else if (session.actionData.fieldToModify === 'tipo_propiedad') {
                    const tipos = {
                        'casa': 'casa',
                        'departamento': 'departamento',
                        'terreno': 'terreno',
                        'oficina': 'oficina',
                        'local': 'local'
                    };
                    validatedValue = tipos[input.toLowerCase()] || input;
                }
                
                const updateData = {
                    propertyId: session.actionData.propertyId,
                    updateData: {
                        [session.actionData.fieldToModify]: validatedValue
                    }
                };
                
                return {
                    success: true,
                    message: '✅ Actualizando propiedad...',
                    executeCommand: {
                        type: 'update_property',
                        parameters: updateData
                    }
                };
            
            case 10: // ID después de mostrar lista
                session.actionData.propertyId = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Ubicación\n3. Precio\n4. Descripción\n5. Tipo de propiedad\n6. Superficie\n7. Dimensiones\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
                };
        }
    }

    // Procesar agregar agente
    processAddAgent(session, input) {
        switch (session.actionStep) {
            case 1: // Nombre
                session.actionData.nombre = input;
                session.actionStep = 2;
                return {
                    success: true,
                    message: '📝 Ingresa el *apellido* del agente/gerente:',
                    waitingFor: 'agent_surname'
                };
            
            case 2: // Apellido
                session.actionData.apellido = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '📱 Ingresa el *número de teléfono* del agente:',
                    waitingFor: 'agent_phone'
                };
            
            case 3: // Teléfono
                const phone = input.replace(/\D/g, '');
                if (phone.length < 8) {
                    return {
                        success: false,
                        message: '❌ Número inválido. Debe tener al menos 8 dígitos:',
                        waitingFor: 'agent_phone'
                    };
                }
                session.actionData.telefono = phone;
                session.actionStep = 4;
                return {
                    success: true,
                    message: '👔 Selecciona el cargo:\n\n1. Agente\n2. Gerente',
                    waitingFor: 'agent_role'
                };
            
            case 4: // Cargo
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
                                apellido: session.actionData.apellido,
                                telefono: session.actionData.telefono,
                                cargo_id: session.actionData.cargo_id
                            }
                        }
                    },
                    generateQR: true // Flag para generar QR después
                };
        }
    }

    // Procesar modificar agente
    processModifyAgent(session, input) {
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
                    session.actionStep = 10; // Paso especial para después de mostrar lista
                    return {
                        success: true,
                        message: '📋 Obteniendo lista de agentes...',
                        executeCommand: {
                            type: 'list_agents',
                            parameters: { forSelection: true }
                        }
                    };
                } else {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona 1 o 2:',
                        waitingFor: 'modify_agent_choice'
                    };
                }
                break;
            
            case 2: // ID ingresado directamente
                session.actionData.identifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Apellido\n3. Teléfono\n4. Cargo\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
                };
            
            case 3: // Campo a modificar
                const fields = {
                    '1': 'nombre',
                    '2': 'apellido',
                    '3': 'telefono',
                    '4': 'cargo_id'
                };
                
                session.actionData.fieldToModify = fields[input];
                
                if (!session.actionData.fieldToModify) {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona del 1 al 4:',
                        waitingFor: 'modify_field'
                    };
                }
                
                session.actionStep = 4;
                let promptMessage = '';
                
                switch (session.actionData.fieldToModify) {
                    case 'nombre':
                        promptMessage = '📝 Ingresa el nuevo nombre:';
                        break;
                    case 'apellido':
                        promptMessage = '📝 Ingresa el nuevo apellido:';
                        break;
                    case 'telefono':
                        promptMessage = '📱 Ingresa el nuevo teléfono:';
                        break;
                    case 'cargo_id':
                        promptMessage = '👔 Selecciona el nuevo cargo:\n\n1. Agente\n2. Gerente';
                        break;
                }
                
                return {
                    success: true,
                    message: promptMessage,
                    waitingFor: 'new_value'
                };
            
            case 4: // Nuevo valor
                let validatedValue = input;
                
                // Validación específica según el campo
                if (session.actionData.fieldToModify === 'telefono') {
                    const phone = input.replace(/\D/g, '');
                    if (phone.length < 8) {
                        return {
                            success: false,
                            message: '❌ Teléfono inválido. Debe tener al menos 8 dígitos:',
                            waitingFor: 'new_value'
                        };
                    }
                    validatedValue = phone;
                } else if (session.actionData.fieldToModify === 'cargo_id') {
                    validatedValue = input === '2' ? 2 : 1; // 1=Agente, 2=Gerente
                }
                
                session.currentAction = null;
                
                const updateData = {
                    identifier: session.actionData.identifier,
                    agentData: {
                        [session.actionData.fieldToModify]: validatedValue
                    }
                };
                
                return {
                    success: true,
                    message: '✅ Actualizando información del agente/gerente...',
                    executeCommand: {
                        type: 'update_agent',
                        parameters: updateData
                    }
                };
            
            case 10: // ID después de mostrar lista
                session.actionData.identifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '✏️ ¿Qué deseas modificar?\n\n1. Nombre\n2. Apellido\n3. Teléfono\n4. Cargo\n\nSelecciona una opción:',
                    waitingFor: 'modify_field'
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
                    session.actionStep = 10; // Paso especial para después de mostrar lista
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
            
            case 10: // ID después de mostrar lista
                session.actionData.identifier = input;
                session.actionStep = 3;
                return {
                    success: true,
                    message: '🔄 ¿Qué acción deseas realizar?\n\n1. Dar de BAJA (desactivar)\n2. Dar de ALTA (activar)',
                    waitingFor: 'toggle_action'
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
    processAddFile(session, input, userData) {
        switch (session.actionStep) {
            case 1: // Elección inicial
                if (input === '1') {
                    session.actionStep = 2;
                    return {
                        success: true,
                        message: '🔍 Ingresa el ID de la propiedad:',
                        waitingFor: 'property_id'
                    };
                } else if (input === '2') {
                    session.actionStep = 10; // Paso especial para después de mostrar lista
                    return {
                        success: true,
                        message: '📋 Obteniendo tus propiedades...',
                        executeCommand: {
                            type: 'list_properties',
                            parameters: { 
                                forSelection: true,
                                filters: { usuario_id: userData.id }
                            }
                        }
                    };
                } else {
                    return {
                        success: false,
                        message: '❌ Opción no válida. Selecciona 1 o 2:',
                        waitingFor: 'add_file_choice'
                    };
                }
                break;
            
            case 2: // ID de propiedad ingresado directamente
                session.actionData.propertyId = input;
                session.actionData.uploadedFiles = []; // Inicializar array de archivos
                session.actionStep = 3;
                return {
                    success: true,
                    message: '📎 **SUBIR ARCHIVOS A PROPIEDAD**\n\nPuedes enviar múltiples archivos (imágenes, documentos, videos):\n\n• Envía uno o más archivos\n• Cuando termines de enviar archivos, escribe "CONFIRMAR" para procesarlos\n• Para cancelar, escribe "CANCELAR"\n\nEnvía el primer archivo:',
                    waitingFor: 'multiple_files',
                    expectsMedia: true
                };
            
            case 3: // Recibiendo archivos múltiples
                if (input.toLowerCase() === 'confirmar') {
                    if (!session.actionData.uploadedFiles || session.actionData.uploadedFiles.length === 0) {
                        return {
                            success: false,
                            message: '❌ No se han enviado archivos. Envía al menos un archivo antes de confirmar.',
                            waitingFor: 'multiple_files'
                        };
                    }
                    
                    session.currentAction = null;
                    return {
                        success: true,
                        message: `✅ Procesando ${session.actionData.uploadedFiles.length} archivo(s)...`,
                        executeCommand: {
                            type: 'add_property_file',
                            parameters: {
                                propertyId: session.actionData.propertyId,
                                fileData: {
                                    multipleFiles: true,
                                    filesList: session.actionData.uploadedFiles,
                                    totalFiles: session.actionData.uploadedFiles.length
                                }
                            }
                        }
                    };
                }
                
                if (input.toLowerCase() === 'cancelar') {
                    session.currentAction = null;
                    session.actionData = {};
                    return {
                        success: true,
                        message: '❌ Carga de archivos cancelada.',
                        showMenu: true
                    };
                }
                
                // Agregar archivo a la lista (aquí input sería la info del archivo)
                if (!session.actionData.uploadedFiles) {
                    session.actionData.uploadedFiles = [];
                }
                session.actionData.uploadedFiles.push(input);
                
                return {
                    success: true,
                    message: `📎 Archivo ${session.actionData.uploadedFiles.length} recibido.\n\n• Envía más archivos o escribe "CONFIRMAR" para procesarlos\n• Total archivos pendientes: ${session.actionData.uploadedFiles.length}`,
                    waitingFor: 'multiple_files',
                    expectsMedia: true
                };
            
            case 10: // ID después de mostrar lista
                session.actionData.propertyId = input;
                session.actionData.uploadedFiles = [];
                session.actionStep = 3;
                return {
                    success: true,
                    message: '📎 **SUBIR ARCHIVOS A PROPIEDAD**\n\nPuedes enviar múltiples archivos (imágenes, documentos, videos):\n\n• Envía uno o más archivos\n• Cuando termines de enviar archivos, escribe "CONFIRMAR" para procesarlos\n• Para cancelar, escribe "CANCELAR"\n\nEnvía el primer archivo:',
                    waitingFor: 'multiple_files',
                    expectsMedia: true
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