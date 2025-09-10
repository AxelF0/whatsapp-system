// servidor/modulo-backend/src/services/commandProcessor.js

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const PropertyModel = require('../../../modulo-base-datos/src/models/postgresql/propertyModel');

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
            'list_properties_inactive': {
                name: 'Listar Propiedades Eliminadas',
                description: 'Muestra lista de propiedades eliminadas',
                format: 'LISTAR PROPIEDADES ELIMINADAS',
                example: 'LISTAR PROPIEDADES ELIMINADAS',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleListPropertiesInactive.bind(this)
            },
            'property_details': {
                name: 'Ver Detalles de Propiedad',
                description: 'Muestra información completa de una propiedad',
                format: 'VER PROPIEDAD [ID]',
                example: 'VER PROPIEDAD PROP001',
                requiredRole: ['agente', 'gerente'],
                handler: this.handlePropertyDetails.bind(this)
            },
            'add_property_file': {
                name: 'Agregar Archivo a Propiedad',
                description: 'Agrega un archivo (imagen/documento) a una propiedad',
                format: 'AGREGAR ARCHIVO [propertyId] [archivo]',
                example: 'AGREGAR ARCHIVO PROP001 imagen.jpg',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleAddPropertyFile.bind(this)
            },
            'search_properties': {
                name: 'Buscar Propiedades',
                description: 'Busca propiedades con filtros específicos',
                format: 'BUSCAR PROPIEDADES [filtros]',
                example: 'BUSCAR PROPIEDADES precio max 200000',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleSearchProperties.bind(this)
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
            'list_clients_inactive': {
                name: 'Listar Clientes Eliminados',
                description: 'Muestra lista de clientes eliminados',
                format: 'LISTAR CLIENTES ELIMINADOS',
                example: 'LISTAR CLIENTES ELIMINADOS',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleListClientsInactive.bind(this)
            },
            'client_history': {
                name: 'Historial de Cliente',
                description: 'Muestra el historial de interacciones con un cliente',
                format: 'HISTORIAL CLIENTE [teléfono]',
                example: 'HISTORIAL CLIENTE 70123456',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleClientHistory.bind(this)
            },
            'deactivate_client': {
                name: 'Dar de Baja Cliente',
                description: 'Desactiva un cliente del sistema',
                format: 'BAJA CLIENTE [ID o teléfono]',
                example: 'BAJA CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleDeactivateClient.bind(this)
            },
            'activate_client': {
                name: 'Dar de Alta Cliente',
                description: 'Reactiva un cliente desactivado',
                format: 'ALTA CLIENTE [ID o teléfono]',
                example: 'ALTA CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleActivateClient.bind(this)
            },
            'toggle_client': {
                name: 'Cambiar Estado Cliente',
                description: 'Alterna entre activo/inactivo un cliente',
                format: 'CAMBIAR CLIENTE [ID o teléfono]',
                example: 'CAMBIAR CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleToggleClient.bind(this)
            },
            'delete_property': {
                name: 'Eliminar Propiedad',
                description: 'Elimina lógicamente una propiedad',
                format: 'ELIMINAR PROPIEDAD [ID]',
                example: 'ELIMINAR PROPIEDAD 123',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleDeleteProperty.bind(this)
            },
            'activate_property': {
                name: 'Activar Propiedad',
                description: 'Reactiva una propiedad eliminada',
                format: 'ACTIVAR PROPIEDAD [ID]',
                example: 'ACTIVAR PROPIEDAD 123',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleActivateProperty.bind(this)
            },
            'delete_client': {
                name: 'Eliminar Cliente',
                description: 'Elimina lógicamente un cliente',
                format: 'ELIMINAR CLIENTE [ID o teléfono]',
                example: 'ELIMINAR CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleDeleteClient.bind(this)
            },
            'activate_client': {
                name: 'Activar Cliente',
                description: 'Reactiva un cliente eliminado',
                format: 'REACTIVAR CLIENTE [ID o teléfono]',
                example: 'REACTIVAR CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleReactivateClient.bind(this)
            },
            'reactivate_client': {
                name: 'Reactivar Cliente',
                description: 'Reactiva un cliente eliminado',
                format: 'REACTIVAR CLIENTE [ID o teléfono]',
                example: 'REACTIVAR CLIENTE 70123456',
                requiredRole: ['gerente'],
                handler: this.handleReactivateClient.bind(this)
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
            'check_agent_status': {
                name: 'Verificar Estado de Agente',
                description: 'Verifica el estado actual de un agente para auto-detectar la acción a realizar',
                format: 'VERIFICAR ESTADO AGENTE [identificador]',
                example: 'VERIFICAR ESTADO AGENTE 70987654',
                requiredRole: ['gerente'],
                handler: this.handleCheckAgentStatus.bind(this)
            },
            'toggle_agent': {
                name: 'Dar de Alta/Baja Agente',
                description: 'Activa o desactiva un agente del sistema',
                format: 'CAMBIAR ESTADO AGENTE [identificador] [acción]',
                example: 'CAMBIAR ESTADO AGENTE 70987654 activate',
                requiredRole: ['gerente'],
                handler: this.handleToggleAgent.bind(this)
            },
            'list_agents': {
                name: 'Listar Agentes',
                description: 'Muestra lista de agentes del sistema',
                format: 'LISTAR AGENTES',
                example: 'LISTAR AGENTES',
                requiredRole: ['gerente'],
                handler: this.handleListAgents.bind(this)
            },
            'list_agents_by_status': {
                name: 'Listar Agentes por Estado',
                description: 'Muestra lista de agentes filtrados por estado (activos/inactivos)',
                format: 'LISTAR AGENTES [estado]',
                example: 'LISTAR AGENTES activos',
                requiredRole: ['gerente'],
                handler: this.handleListAgentsByStatus.bind(this)
            },

            // Comando de ayuda
            'help': {
                name: 'Ayuda',
                description: 'Muestra comandos disponibles',
                format: 'AYUDA [comando opcional]',
                example: 'AYUDA',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleHelp.bind(this)
            },

            // Comandos de filtros de búsqueda
            'search_by_operation': {
                name: 'Buscar por Tipo de Operación',
                description: 'Busca propiedades por tipo de operación',
                format: 'BUSCAR OPERACION [venta/alquiler]',
                example: 'BUSCAR OPERACION venta',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleSearchByOperation.bind(this)
            },
            'search_by_property_type': {
                name: 'Buscar por Tipo de Propiedad',
                description: 'Busca propiedades por tipo',
                format: 'BUSCAR TIPO [casa/departamento/terreno/oficina/local]',
                example: 'BUSCAR TIPO casa',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleSearchByPropertyType.bind(this)
            },
            'search_by_status': {
                name: 'Buscar por Estado',
                description: 'Busca propiedades por estado',
                format: 'BUSCAR ESTADO [disponible/reservada/vendida/alquilada]',
                example: 'BUSCAR ESTADO disponible',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleSearchByStatus.bind(this)
            },

            // Comandos de envío masivo
            'broadcast_clients': {
                name: 'Envío Masivo a Clientes',
                description: 'Envía mensaje masivo a todos los clientes del agente',
                format: 'ENVIAR CLIENTES [mensaje]',
                example: 'ENVIAR CLIENTES Nueva propiedad disponible en Las Palmas',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleBroadcastClients.bind(this)
            },
            'broadcast_clients_filtered': {
                name: 'Envío Masivo Filtrado',
                description: 'Envía mensaje masivo a clientes con filtros específicos',
                format: 'ENVIAR CLIENTES FILTRADOS [filtro] [mensaje]',
                example: 'ENVIAR CLIENTES FILTRADOS activos Nueva propiedad de 3 dormitorios',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleBroadcastClientsFiltered.bind(this)
            },
            'broadcast_clients_custom': {
                name: 'Envío Masivo Personalizado',
                description: 'Envía mensaje masivo a clientes seleccionados manualmente',
                format: 'Selección manual desde menú interactivo',
                example: 'Usado desde menú: Opción 2 - Enviar a Clientes Filtrados',
                requiredRole: ['agente', 'gerente'],
                handler: this.handleBroadcastClientsCustom.bind(this)
            },
            'broadcast_agents': {
                name: 'Envío Masivo a Agentes',
                description: 'Envía mensaje masivo a todos los agentes (solo gerentes)',
                format: 'ENVIAR AGENTES [mensaje]',
                example: 'ENVIAR AGENTES Reunión de equipo mañana a las 10:00',
                requiredRole: ['gerente'],
                handler: this.handleBroadcastAgents.bind(this)
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

            // NOTA: No enviar respuesta desde Backend para evitar duplicados
            // Solo retornar datos al módulo de procesamiento
            console.log('✅ Comando procesado, retornando resultado al Processing');

            return result;

        } catch (error) {
            console.error('❌ Error procesando comando:', error.message);

            this.stats.totalCommands++;
            this.stats.failedCommands++;

            // NOTA: No enviar respuesta de error desde Backend para evitar duplicados
            // Solo retornar error al módulo de procesamiento
            console.log('⚠️ Error procesado, retornando error al Processing');

            throw error;
        }
    }

    // ==================== HANDLERS DE COMANDOS ====================

    // Handler: Crear Propiedad
    async handleCreateProperty(commandData) {
        const params = commandData.command.parameters;
        
        const propertyData = {
            usuario_id: commandData.user.id,
            nombre_propiedad: params.propertyData?.nombre_propiedad || params.nombre_propiedad || 'Propiedad sin nombre',
            descripcion: params.propertyData?.descripcion || params.descripcion || '',
            precio_venta: params.propertyData?.precio_venta || params.precio_venta || null,
            precio_alquiler: params.propertyData?.precio_alquiler || params.precio_alquiler || null,
            ubicacion: params.propertyData?.ubicacion || params.ubicacion || '',
            superficie: params.propertyData?.superficie || params.superficie || '',
            dimensiones: params.propertyData?.dimensiones || params.dimensiones || '',
            tipo_propiedad_id: params.propertyData?.tipo_propiedad_id || params.tipo_propiedad_id || null,
            tipo_operacion_id: params.propertyData?.tipo_operacion_id || params.tipo_operacion_id || null,
            estado_propiedad_id: params.propertyData?.estado_propiedad_id || params.estado_propiedad_id || 1
        };

        // Validar que los datos requeridos estén presentes
        if (!propertyData.nombre_propiedad || propertyData.nombre_propiedad === 'Propiedad sin nombre') {
            throw new Error('Nombre de la propiedad es requerido');
        }
        
        // Validar que al menos un precio esté presente y sea válido
        const hasValidSalePrice = propertyData.precio_venta && propertyData.precio_venta > 0;
        const hasValidRentalPrice = propertyData.precio_alquiler && propertyData.precio_alquiler > 0;
        
        if (!hasValidSalePrice && !hasValidRentalPrice) {
            throw new Error('Precio válido es requerido');
        }
        
        if (!propertyData.ubicacion) {
            throw new Error('Ubicación es requerida');
        }
    
        const property = await this.propertyService.create(propertyData);
        
        // Formatear ID para mostrar
        const displayId = `PROP${String(property.id).padStart(3, '0')}`;
    
        return {
            success: true,
            action: 'property_created',
            message: `✅ Propiedad registrada exitosamente\n\n📋 **DATOS COMPLETOS:**\n🆔 ID: ${displayId}\n🏠 Nombre: ${property.nombre_propiedad}\n📍 Ubicación: ${property.ubicacion}\n${PropertyModel.formatPriceByOperationType(property)}\n🏗️ Tipo: ${property.tipo_propiedad_nombre || 'No especificado'}\n🎯 Operación: ${property.tipo_operacion_nombre || 'No especificada'}\n📏 Superficie: ${property.superficie || 'No especificada'}\n📐 Dimensiones: ${property.dimensiones || 'No especificadas'}\n📝 Descripción: ${property.descripcion || 'Sin descripción'}\n👨‍💼 Agente: ${commandData.user.name}\n📅 Fecha de registro: ${new Date().toLocaleDateString()}`,
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

        if (!params.updateData || Object.keys(params.updateData).length === 0) {
            throw new Error('Datos de actualización requeridos');
        }

        console.log('🔄 Actualizando propiedad:', params.propertyId, 'con datos:', params.updateData);

        try {
            const property = await this.propertyService.update(params.propertyId, params.updateData);

            if (!property) {
                throw new Error('No se pudo actualizar la propiedad');
            }

            const PropertyModel = require('../../../modulo-base-datos/src/models/postgresql/propertyModel');

            return {
                success: true,
                action: 'property_updated',
                message: `✅ Propiedad actualizada exitosamente\n\n📋 **DATOS COMPLETOS:**\n🏠 Nombre: ${property.nombre_propiedad}\n📍 Ubicación: ${property.ubicacion}\n${PropertyModel.formatPriceByOperationType(property)}\n🏗️ Tipo: ${property.tipo_propiedad_nombre || property.tipo_propiedad || 'No especificado'}\n📊 Estado: ${property.estado_propiedad_nombre || 'No especificado'}\n🎯 Operación: ${property.tipo_operacion_nombre || 'No especificado'}\n📏 Superficie: ${property.superficie || 'No especificada'}\n📐 Dimensiones: ${property.dimensiones || 'No especificadas'}\n📝 Descripción: ${property.descripcion || 'Sin descripción'}\n🆔 ID: ${property.id}\n📅 Última actualización: ${new Date().toLocaleDateString()}`,
                data: property
            };

        } catch (error) {
            console.error('❌ Error actualizando propiedad:', error.message);
            throw new Error('Error actualizando propiedad: ' + error.message);
        }
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

        console.log('📋 handleListProperties - Filtros recibidos:', filters);
        console.log('📋 handleListProperties - Usuario ID:', commandData.user?.id);
        
        if (filters.usuario_id) {
            console.log(`🎯 FILTRO CRÍTICO: Buscando propiedades del usuario ID ${filters.usuario_id}`);
            console.log(`   Según la DB deberías tener: Usuario 4 = 2 propiedades, Usuario 1 = 4 propiedades`);
        }

        const properties = await this.propertyService.list(filters);

        console.log(`📋 handleListProperties - Propiedades encontradas: ${properties.length}`);
        
        if (filters.usuario_id && properties.length > 0) {
            console.log('🏠 Lista de propiedades encontradas:');
            properties.forEach((prop, index) => {
                console.log(`   ${index + 1}. ${prop.nombre_propiedad} (ID: ${prop.id}, Usuario: ${prop.usuario_id})`);
            });
        } else if (filters.usuario_id && properties.length === 0) {
            console.log(`❌ NO SE ENCONTRARON propiedades para el usuario ${filters.usuario_id}`);
        }

        if (properties.length === 0) {
            return {
                success: true,
                action: 'properties_listed',
                message: '📋 No se encontraron propiedades con los filtros especificados',
                data: []
            };
        }

        // Determinar si es para selección (modificar/agregar archivo)
        const forSelection = params.forSelection || false;
        
        const listMessage = properties.slice(0, 10).map((p, i) =>
            forSelection ? 
                `${i + 1}. 🏠 **${p.nombre_propiedad}**\n   📍 ${p.ubicacion}\n   ${PropertyModel.formatPriceByOperationType(p)}\n   🎯 ${p.tipo_operacion_nombre}\n   🆔 ID: ${p.id}` :
                `${i + 1}. 🏠 ${p.nombre_propiedad}\n   📍 ${p.ubicacion}\n   ${PropertyModel.formatPriceByOperationType(p)}\n   🎯 ${p.tipo_operacion_nombre}`
        ).join('\n\n');

        const title = forSelection ? 
            `📋 **TUS PROPIEDADES** (${properties.length}):` :
            `📊 **Propiedades disponibles** (${properties.length}):`;

        return {
            success: true,
            action: 'properties_listed',
            message: `${title}\n\n${listMessage}`,
            data: properties,
            templateId: 'search_results',
            templateData: {
                total: properties.length,
                propiedades: properties.map(p => {
                    const PropertyModel = require('../../../modulo-base-datos/src/models/postgresql/propertyModel');
                    return {
                        nombre: p.nombre_propiedad,
                        ubicacion: p.ubicacion,
                        precio: PropertyModel.formatPriceByOperationType(p),
                        tipo_operacion: p.tipo_operacion_nombre || 'No especificado',
                        tipo_propiedad: p.tipo_propiedad_nombre || 'No especificado',
                        estado_propiedad: p.estado_propiedad_nombre || 'No especificado',
                        dormitorios: p.dormitorios,
                        banos: p.banos
                    };
                })
            }
        };
    }

    // Handler: Listar Propiedades Eliminadas
    async handleListPropertiesInactive(commandData) {
        const params = commandData.command.parameters;
        const baseFilters = { estado: 0 }; // Solo propiedades eliminadas
        
        // Combinar con filtros adicionales (como usuario_id)
        const filters = params.filters ? { ...baseFilters, ...params.filters } : baseFilters;

        console.log('🗑️ handleListPropertiesInactive - Filtros:', filters);

        const properties = await this.propertyService.list(filters);

        console.log(`🗑️ handleListPropertiesInactive - Propiedades eliminadas encontradas: ${properties.length}`);

        if (properties.length === 0) {
            return {
                success: true,
                action: 'properties_inactive_listed',
                message: '📋 No se encontraron propiedades eliminadas',
                data: []
            };
        }

        const PropertyModel = require('../../../modulo-base-datos/src/models/postgresql/propertyModel');

        const listMessage = properties.slice(0, 10).map((p, i) =>
            `${i + 1}. 🏠 ${p.nombre_propiedad}\n   📍 ${p.ubicacion}\n   ${PropertyModel.formatPriceByOperationType(p)}\n   🎯 ${p.tipo_operacion_nombre || 'No especificado'}\n   🏗️ ${p.tipo_propiedad_nombre || 'No especificado'}\n   📊 ${p.estado_propiedad_nombre || 'No especificado'}\n   🆔 ID: ${p.id}`
        ).join('\n\n');

        return {
            success: true,
            action: 'properties_inactive_listed',
            message: `🗑️ **Propiedades eliminadas** (${properties.length}):\n\n${listMessage}`,
            data: properties
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

        const PropertyModel = require('../../../modulo-base-datos/src/models/postgresql/propertyModel');

        return {
            success: true,
            action: 'property_details',
            message: `🏠 **${property.nombre_propiedad}**\n\n📍 ${property.ubicacion}\n${PropertyModel.formatPriceByOperationType(property)}\n🎯 Operación: ${property.tipo_operacion_nombre || 'No especificado'}\n🏗️ Tipo: ${property.tipo_propiedad_nombre || property.tipo_propiedad || 'No especificado'}\n📊 Estado: ${property.estado_propiedad_nombre || 'No especificado'}\n📏 Superficie: ${property.superficie || 'No especificada'}\n📐 Dimensiones: ${property.dimensiones || 'No especificadas'}\n\n📝 ${property.descripcion || 'Sin descripción'}`,
            data: property,
            templateId: 'property_info',
            templateData: property
        };
    }

    // Handler: Agregar Archivo a Propiedad
    async handleAddPropertyFile(commandData) {
        const params = commandData.command.parameters;
        
        if (!params.propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        const propertyId = params.propertyId;
        const fileData = params.fileData || {};
        
        // Verificar que la propiedad existe
        const property = await this.propertyService.getById(propertyId);
        if (!property) {
            throw new Error(`Propiedad ${propertyId} no encontrada`);
        }

        // Verificar si son múltiples archivos
        if (fileData.multipleFiles && fileData.filesList) {
            console.log(`📁 Procesando ${fileData.totalFiles} archivos para propiedad ${propertyId}`);

            // Organizar archivos por tipo
            const organizedFiles = this.organizeFilesByType(fileData.filesList);
            
            // Procesar archivos según su tipo
            const processedFiles = await this.processFilesByType(organizedFiles, propertyId);

            // Generar resumen de procesamiento
            const summary = this.generateFileProcessingSummary(processedFiles);

            return {
                success: true,
                action: 'multiple_files_added',
                message: `✅ **Archivos procesados exitosamente**\n\n🏠 **${property.nombre_propiedad}**\n📍 ${property.ubicacion}\n\n📊 **Resumen de procesamiento:**\n${summary}\n\n💾 **Ubicaciones:**\n${this.generateFileLocationsSummary(processedFiles)}`,
                data: {
                    propertyId: propertyId,
                    property: property,
                    processedFiles: processedFiles,
                    totalFiles: fileData.totalFiles
                }
            };
        }

        // Archivo único
        return {
            success: true,
            action: 'file_added',
            message: `✅ Archivo agregado exitosamente a la propiedad\n\n🏠 **${property.nombre_propiedad}**\n📍 ${property.ubicacion}\n📎 Archivo recibido y procesado\n\n💡 El archivo ha sido asociado a la propiedad ID: ${propertyId}`,
            data: {
                propertyId: propertyId,
                property: property,
                fileProcessed: true
            }
        };
    }


    // Organizar archivos por tipo
    organizeFilesByType(filesList) {
        const organized = {
            images: [],
            documents: [],
            videos: [],
            pdfs: [],
            others: []
        };

        filesList.forEach(file => {
            const mimeType = file.mimeType?.toLowerCase() || '';
            const fileName = file.fileName?.toLowerCase() || '';
            
            if (mimeType.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) {
                organized.images.push(file);
            } else if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
                organized.pdfs.push(file);
            } else if (fileName.match(/\.(doc|docx)$/)) {
                // Word files go to docs folder (not converted to PDF)
                organized.documents.push({...file, fileType: 'word'});
            } else if (mimeType.startsWith('video/') || fileName.match(/\.(mp4|avi|mov|wmv|flv|webm)$/)) {
                organized.videos.push(file);
            } else if (fileName.match(/\.(txt|rtf|odt|xlsx|xls|ppt|pptx)$/)) {
                organized.documents.push(file);
            } else {
                organized.others.push(file);
            }
        });

        return organized;
    }

    // Procesar archivos por tipo
    async processFilesByType(organizedFiles, propertyId) {
        const processed = {
            images: [],
            documents: [],
            videos: [],
            pdfs: [],
            others: [],
            conversions: []
        };

        try {
            // Asegurar que todas las carpetas de destino existan
            await this.ensureDirectoriesExist();

            // Procesar PDFs - van al módulo de IA
            for (const file of organizedFiles.pdfs) {
                const destinationPath = path.resolve(__dirname, '../../../modulo-ia/data/pdfs');
                processed.pdfs.push({
                    ...file,
                    savedTo: '../modulo-ia/data/pdfs/',
                    fullPath: destinationPath,
                    category: 'pdf_document'
                });
            }

            // Procesar imágenes - van al backend/files/images/
            for (const file of organizedFiles.images) {
                const destinationPath = path.resolve(__dirname, '../../files/images');
                processed.images.push({
                    ...file,
                    savedTo: './files/images/',
                    fullPath: destinationPath,
                    category: 'image_file'
                });
            }

            // Procesar documentos Word y otros docs
            for (const file of organizedFiles.documents) {
                if (file.fileType === 'word') {
                    // Word docs van al módulo de IA
                    const destinationPath = path.resolve(__dirname, '../../../modulo-ia/data/docs');
                    processed.documents.push({
                        ...file,
                        savedTo: '../modulo-ia/data/docs/',
                        fullPath: destinationPath,
                        category: 'word_document'
                    });
                } else {
                    // Otros documentos van a backend/files/others/
                    const destinationPath = path.resolve(__dirname, '../../files/others');
                    processed.documents.push({
                        ...file,
                        savedTo: './files/others/',
                        fullPath: destinationPath,
                        category: 'general_document'
                    });
                }
            }

            // Procesar videos - van al backend/files/videos/
            for (const file of organizedFiles.videos) {
                const destinationPath = path.resolve(__dirname, '../../files/videos');
                processed.videos.push({
                    ...file,
                    savedTo: './files/videos/',
                    fullPath: destinationPath,
                    category: 'video_file'
                });
            }

            // Procesar otros - van al backend/files/others/
            for (const file of organizedFiles.others) {
                const destinationPath = path.resolve(__dirname, '../../files/others');
                processed.others.push({
                    ...file,
                    savedTo: './files/others/',
                    fullPath: destinationPath,
                    category: 'other_file'
                });
            }

        } catch (error) {
            console.error('❌ Error procesando archivos:', error.message);
            throw new Error('Error procesando archivos: ' + error.message);
        }

        return processed;
    }

    // Asegurar que todas las carpetas de destino existan
    async ensureDirectoriesExist() {
        const directories = [
            // Módulo IA - PDFs
            path.resolve(__dirname, '../../../modulo-ia/data/pdfs'),
            // Módulo IA - Documentos Word
            path.resolve(__dirname, '../../../modulo-ia/data/docs'),
            // Backend - Imágenes
            path.resolve(__dirname, '../../files/images'),
            // Backend - Videos
            path.resolve(__dirname, '../../files/videos'),
            // Backend - Otros archivos
            path.resolve(__dirname, '../../files/others')
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`📁 Directorio asegurado: ${dir}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    console.error(`❌ Error creando directorio ${dir}:`, error.message);
                    throw error;
                }
            }
        }
    }

    // Convertir Word a PDF
    async convertWordToPdf(wordFile) {
        // Simulación de conversión - en implementación real usaríamos librerías como:
        // - libre-office-convert
        // - docx-pdf
        // - pandoc
        
        console.log(`🔄 Convirtiendo archivo Word a PDF: ${wordFile.fileName}`);
        
        return {
            fileName: wordFile.fileName.replace(/\.(doc|docx)$/, '.pdf'),
            mimeType: 'application/pdf',
            size: wordFile.size,
            originalFile: wordFile.fileName,
            converted: true
        };
    }

    // Generar resumen de procesamiento
    generateFileProcessingSummary(processedFiles) {
        const counts = {
            images: processedFiles.images.length,
            documents: processedFiles.documents.length,
            videos: processedFiles.videos.length,
            pdfs: processedFiles.pdfs.length,
            others: processedFiles.others.length,
            conversions: processedFiles.conversions.length
        };

        const summary = [];
        
        if (counts.images > 0) summary.push(`📷 ${counts.images} imagen(es) → Backend/files/images/`);
        if (counts.pdfs > 0) summary.push(`📑 ${counts.pdfs} PDF(s) → Módulo IA/data/pdfs/`);
        if (counts.videos > 0) summary.push(`🎥 ${counts.videos} video(s) → Backend/files/videos/`);
        
        if (counts.documents > 0) {
            const wordDocs = processedFiles.documents.filter(d => d.category === 'word_document').length;
            const otherDocs = processedFiles.documents.filter(d => d.category === 'general_document').length;
            
            if (wordDocs > 0) summary.push(`📄 ${wordDocs} documento(s) Word → Módulo IA/data/docs/`);
            if (otherDocs > 0) summary.push(`📋 ${otherDocs} documento(s) general → Backend/files/others/`);
        }
        
        if (counts.others > 0) summary.push(`📁 ${counts.others} archivo(s) otros → Backend/files/others/`);

        return summary.join('\n') || '• Sin archivos procesados';
    }

    // Generar resumen de ubicaciones
    generateFileLocationsSummary(processedFiles) {
        const locations = [];
        
        if (processedFiles.pdfs.length > 0) {
            locations.push(`📑 PDFs (${processedFiles.pdfs.length}) → modulo-ia/data/pdfs/`);
        }
        if (processedFiles.images.length > 0) {
            locations.push(`📷 Imágenes (${processedFiles.images.length}) → modulo-backend/files/images/`);
        }
        if (processedFiles.documents.length > 0) {
            const wordDocs = processedFiles.documents.filter(d => d.category === 'word_document').length;
            const otherDocs = processedFiles.documents.filter(d => d.category === 'general_document').length;
            
            if (wordDocs > 0) {
                locations.push(`📄 Word Docs (${wordDocs}) → modulo-ia/data/docs/`);
            }
            if (otherDocs > 0) {
                locations.push(`📋 Otros Docs (${otherDocs}) → modulo-backend/files/others/`);
            }
        }
        if (processedFiles.videos.length > 0) {
            locations.push(`🎥 Videos (${processedFiles.videos.length}) → modulo-backend/files/videos/`);
        }
        if (processedFiles.others.length > 0) {
            locations.push(`📁 Otros (${processedFiles.others.length}) → modulo-backend/files/others/`);
        }

        return locations.join('\n') || '• Sin archivos procesados';
    }

    // Handler: Buscar Propiedades
    async handleSearchProperties(commandData) {
        const params = commandData.command.parameters;
        const filters = params.filters || {};
        const user = commandData.user;

        console.log('🔍 Buscando propiedades con filtros:', filters);

        try {
            let properties = [];

            // Determinar qué método de búsqueda usar según los filtros
            if (Object.keys(filters).length === 0) {
                // Sin filtros = TODAS las propiedades del sistema
                properties = await this.propertyService.searchAll();
                console.log('📊 Método: TODAS las propiedades');
            } else if (filters.usuario_id) {
                // Con usuario_id = MIS propiedades
                console.log(`📊 Método: MIS propiedades para usuario ID: ${filters.usuario_id}`);
                properties = await this.propertyService.getByAgent(filters.usuario_id);
                console.log(`✅ Encontradas ${properties.length} propiedades del usuario ${filters.usuario_id}`);
            } else if (filters.precio_max && Object.keys(filters).length === 1) {
                // Solo precio = búsqueda por precio máximo
                properties = await this.propertyService.searchByMaxPrice(filters.precio_max);
                console.log('📊 Método: Por PRECIO MÁXIMO');
            } else if (filters.ubicacion && Object.keys(filters).length === 1) {
                // Solo ubicación = búsqueda por ubicación
                properties = await this.propertyService.searchByLocation(filters.ubicacion);
                console.log('📊 Método: Por UBICACIÓN');
            } else if (filters.tipo_propiedad && Object.keys(filters).length === 1) {
                // Solo tipo = búsqueda por tipo
                properties = await this.propertyService.searchByType(filters.tipo_propiedad);
                console.log('📊 Método: Por TIPO');
            } else {
                // Múltiples filtros = búsqueda personalizada
                properties = await this.propertyService.searchCustom(filters);
                console.log('📊 Método: BÚSQUEDA PERSONALIZADA');
            }

            if (!properties || properties.length === 0) {
                return {
                    success: true,
                    action: 'no_properties_found',
                    message: '❌ No se encontraron propiedades que coincidan con los criterios de búsqueda.\n\n💡 Intenta con otros filtros o crea una nueva propiedad.',
                    data: { filters, count: 0 }
                };
            }

            // Formatear lista de propiedades
            let propertyList = properties.map((prop, index) => 
                `${index + 1}. 🏠 **${prop.nombre_propiedad}**\n   📍 ${prop.ubicacion}\n   ${PropertyModel.formatPriceByOperationType(prop)}\n   🎯 ${prop.tipo_operacion_nombre || 'No especificado'}\n   🏗️ ${prop.tipo_propiedad_nombre || 'No especificado'}\n   📊 ${prop.estado_propiedad_nombre || 'No especificado'}\n   🆔 ID: ${prop.id}`
            ).join('\n\n');

            return {
                success: true,
                action: 'properties_found',
                message: `🔍 **PROPIEDADES ENCONTRADAS** (${properties.length})\n\n${propertyList}\n\n💡 Para ver detalles, escribe: "VER PROPIEDAD [ID]"`,
                data: {
                    properties: properties,
                    count: properties.length,
                    filters: filters
                }
            };

        } catch (error) {
            console.error('❌ Error buscando propiedades:', error.message);
            throw new Error('Error al buscar propiedades: ' + error.message);
        }
    }

    // Handler: Eliminar Propiedad (soft delete)
    async handleDeleteProperty(commandData) {
        const params = commandData.command.parameters;
        const propertyId = params.propertyId;

        if (!propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        // Verificar que la propiedad existe y está activa
        const property = await this.propertyService.getById(propertyId);
        if (!property) {
            return {
                success: false,
                action: 'delete_property',
                message: '❌ Propiedad no encontrada',
                data: null
            };
        }

        if (property.estado === 0) {
            return {
                success: true,
                action: 'delete_property',
                message: `ℹ️ La propiedad "${property.nombre_propiedad}" ya está eliminada`,
                data: property
            };
        }

        // Eliminar lógicamente (cambiar estado a 0)
        const deletedProperty = await this.propertyService.toggleStatus(propertyId);

        return {
            success: true,
            action: 'delete_property',
            message: `🗑️ Propiedad **${property.nombre_propiedad}** eliminada exitosamente\n📍 ${property.ubicacion}\n🆔 ID: ${propertyId}`,
            data: deletedProperty
        };
    }

    // Handler: Activar Propiedad
    async handleActivateProperty(commandData) {
        const params = commandData.command.parameters;
        const propertyId = params.propertyId;

        if (!propertyId) {
            throw new Error('ID de propiedad requerido');
        }

        // Verificar que la propiedad existe
        const property = await this.propertyService.getByIdAnyStatus(propertyId);
        if (!property) {
            return {
                success: false,
                action: 'activate_property',
                message: '❌ Propiedad no encontrada',
                data: null
            };
        }

        if (property.estado === 1) {
            return {
                success: true,
                action: 'activate_property',
                message: `ℹ️ La propiedad "${property.nombre_propiedad}" ya está activa`,
                data: property
            };
        }

        // Activar (cambiar estado a 1)
        const activatedProperty = await this.propertyService.toggleStatus(propertyId);

        return {
            success: true,
            action: 'activate_property',
            message: `✅ Propiedad **${property.nombre_propiedad}** activada exitosamente\n📍 ${property.ubicacion}\n🆔 ID: ${propertyId}`,
            data: activatedProperty
        };
    }

    // Handler: Crear Cliente
    async handleCreateClient(commandData) {
        const params = commandData.command.parameters;
        const clientData = params.clientData || {};
        // Obtener agente_id desde commandData o userData
        const agente_id = commandData?.userData?.id || commandData?.agentId || commandData?.user?.id || commandData?.session?.userData?.id;

        if (!clientData.telefono) {
            throw new Error('Teléfono del cliente requerido');
        }

        if (!clientData.nombre || !clientData.apellido) {
            throw new Error('Nombre y apellido del cliente son requeridos');
        }
        // Si no se encuentra agente_id, no bloquear el registro, usar null
        console.log('🔍 Agente ID encontrado:', agente_id);

        const client = await this.clientService.createOrUpdate({
            nombre: clientData.nombre,
            apellido: clientData.apellido,
            telefono: clientData.telefono,
            email: clientData.email || '',
            estado: 1,
            agente_id: agente_id || null
        });

        return {
            success: true,
            action: 'client_created',
            message: `✅ Cliente registrado exitosamente\n\n📋 **DATOS DEL CLIENTE:**\n👤 Nombre: ${client.nombre}\n👤 Apellido: ${client.apellido}\n📱 Teléfono: ${client.telefono}\n📧 Email: ${client.email || 'No especificado'}\n🆔 ID: ${client.id}\n📅 Fecha de registro: ${new Date().toLocaleDateString()}`,
            data: client
        };
    }

    // Handler: Actualizar Cliente
    async handleUpdateClient(commandData) {
        const params = commandData.command.parameters;
        const clientData = params.clientData || {};
        const identifier = clientData.telefono; // Este es el identificador original (ID o teléfono)

        if (!identifier) {
            throw new Error('Identificador del cliente requerido');
        }

        // Buscar el cliente por ID o teléfono
        const existingClient = await this.clientService.getByIdOrPhone(identifier);
        if (!existingClient) {
            throw new Error(`Cliente con identificador ${identifier} no encontrado`);
        }

        let updatedData = {};

        // Usar ID del cliente como identificador principal
        const clientId = existingClient.id;
        
        // Si es modificación completa
        if (params.updateType === 'todo') {
            updatedData = {
                id: clientId, // Usar ID como identificador
                nombre: clientData.nombre || existingClient.nombre,
                apellido: clientData.apellido || existingClient.apellido,
                email: clientData.email !== undefined ? clientData.email : existingClient.email,
                telefono: clientData.newTelefono || existingClient.telefono, // Usar nuevo teléfono si existe
                estado: existingClient.estado
            };
        } else {
            // Actualización de campos específicos
            updatedData = {
                id: clientId, // Usar ID como identificador
                nombre: existingClient.nombre,
                apellido: existingClient.apellido,
                email: existingClient.email,
                telefono: existingClient.telefono, // Mantener teléfono original
                estado: existingClient.estado
            };
            
            // Solo actualizar el campo específico que se modificó
            Object.keys(clientData).forEach(key => {
                if (key === 'newTelefono') {
                    updatedData.telefono = clientData[key]; // El nuevo teléfono se asigna al campo telefono
                } else if (key !== 'telefono') { // El teléfono en clientData es el identificador, no el nuevo valor
                    updatedData[key] = clientData[key];
                }
            });
        }

        const client = await this.clientService.createOrUpdate(updatedData);

        return {
            success: true,
            action: 'client_updated',
            message: `✅ Cliente actualizado exitosamente\n\n📋 **DATOS ACTUALIZADOS:**\n👤 Nombre: ${client.nombre}\n👤 Apellido: ${client.apellido}\n📱 Teléfono: ${client.telefono}\n📧 Email: ${client.email || 'No especificado'}\n🆔 ID: ${client.id}\n📅 Última actualización: ${new Date().toLocaleDateString()}`,
            data: client
        };
    }

    // Handler: Listar Clientes
    async handleListClients(commandData) {
        // Obtener el agente actual desde commandData.user (debe estar presente en sesión)
        const agente_id = commandData?.user?.id || null;
        console.log('🔍 Listando clientes para agente ID:', agente_id);
        
        const clients = await this.clientService.list({ agente_id });

        if (clients.length === 0) {
            return {
                success: true,
                action: 'clients_listed',
                message: '📋 No hay clientes registrados para tu usuario',
                data: []
            };
        }

        const listMessage = clients.slice(0, 15).map((c, i) => {
            let clientInfo = `${i + 1}. 👤 ${c.nombre} ${c.apellido} (ID: ${c.id})\n   📱 ${c.telefono}`;
            if (c.email) {
                clientInfo += `\n   📧 ${c.email}`;
            }
            if (c.agente_nombre || c.agente_apellido) {
                clientInfo += `\n   👔 Agente: ${(c.agente_nombre || '')} ${(c.agente_apellido || '')}`.trim();
            }
            return clientInfo;
        }).join('\n\n');

        const footerMessage = clients.length > 15 ? `\n\n... y ${clients.length - 15} clientes más` : '';

        return {
            success: true,
            action: 'clients_listed',
            message: `📊 **Clientes registrados (${clients.length}):**\n\n${listMessage}${footerMessage}`,
            data: clients
        };
    }

    // Handler: Listar Clientes Eliminados
    async handleListClientsInactive(commandData) {
        const agente_id = commandData?.user?.id || null;
        console.log('🔍 Listando clientes eliminados para agente ID:', agente_id);
        
        const clients = await this.clientService.listInactive({ agente_id });

        if (clients.length === 0) {
            return {
                success: true,
                action: 'clients_inactive_listed',
                message: '📋 No hay clientes eliminados para tu usuario',
                data: []
            };
        }

        const listMessage = clients.slice(0, 15).map((c, i) => {
            let clientInfo = `${i + 1}. 👤 ${c.nombre} ${c.apellido} (ID: ${c.id})\n   📱 ${c.telefono}`;
            if (c.email) {
                clientInfo += `\n   📧 ${c.email}`;
            }
            if (c.agente_nombre || c.agente_apellido) {
                clientInfo += `\n   👔 Agente: ${(c.agente_nombre || '')} ${(c.agente_apellido || '')}`.trim();
            }
            return clientInfo;
        }).join('\n\n');

        const footerMessage = clients.length > 15 ? `\n\n... y ${clients.length - 15} clientes más` : '';

        return {
            success: true,
            action: 'clients_inactive_listed',
            message: `🗑️ **Clientes eliminados (${clients.length}):**\n\n${listMessage}${footerMessage}`,
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

    // Handler: Dar de Baja Cliente
    async handleDeactivateClient(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;

        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }

        // Buscar cliente por ID o teléfono (cualquier estado)
        const client = await this.clientService.findClientByIdOrPhone(identifier);

        if (!client) {
            return {
                success: false,
                action: 'deactivate_client',
                message: '❌ Cliente no encontrado',
                data: null
            };
        }

        if (client.estado === 0) {
            return {
                success: true,
                action: 'deactivate_client',
                message: `ℹ️ El cliente ${client.nombre} ${client.apellido} ya está inactivo`,
                data: client
            };
        }

        // Desactivar cliente
        const updatedClient = await this.clientService.updateClientStatus(client.id, 0);

        return {
            success: true,
            action: 'deactivate_client',
            message: `✅ Cliente **${updatedClient.nombre} ${updatedClient.apellido}** dado de baja exitosamente\n📱 ${updatedClient.telefono}`,
            data: updatedClient
        };
    }

    // Handler: Dar de Alta Cliente
    async handleActivateClient(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;

        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }

        // Buscar cliente por ID o teléfono (cualquier estado)
        const client = await this.clientService.findClientByIdOrPhone(identifier);

        if (!client) {
            return {
                success: false,
                action: 'activate_client',
                message: '❌ Cliente no encontrado',
                data: null
            };
        }

        if (client.estado === 1) {
            return {
                success: true,
                action: 'activate_client',
                message: `ℹ️ El cliente ${client.nombre} ${client.apellido} ya está activo`,
                data: client
            };
        }

        // Activar cliente
        const updatedClient = await this.clientService.updateClientStatus(client.id, 1);

        return {
            success: true,
            action: 'activate_client',
            message: `✅ Cliente **${updatedClient.nombre} ${updatedClient.apellido}** dado de alta exitosamente\n📱 ${updatedClient.telefono}`,
            data: updatedClient
        };
    }

    // Handler: Cambiar Estado Cliente (toggle)
    async handleToggleClient(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;

        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }

        // Buscar cliente por ID o teléfono (cualquier estado)
        const client = await this.clientService.findClientByIdOrPhone(identifier);

        if (!client) {
            return {
                success: false,
                action: 'toggle_client',
                message: '❌ Cliente no encontrado',
                data: null
            };
        }

        // Alternar estado
        const newStatus = client.estado === 1 ? 0 : 1;
        const updatedClient = await this.clientService.updateClientStatus(client.id, newStatus);

        const action = newStatus === 1 ? 'activado' : 'desactivado';
        const emoji = newStatus === 1 ? '✅' : '❌';

        return {
            success: true,
            action: 'toggle_client',
            message: `${emoji} Cliente **${updatedClient.nombre} ${updatedClient.apellido}** ${action} exitosamente\n📱 ${updatedClient.telefono}`,
            data: updatedClient
        };
    }

    // Handler: Eliminar Cliente (soft delete)
    async handleDeleteClient(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier || params.clientIdentifier;
        const agente_id = commandData?.user?.id || null;

        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }

        // Buscar cliente por ID o teléfono (cualquier estado) pero solo del agente actual
        const client = await this.clientService.findClientByIdOrPhone(identifier, agente_id);

        if (!client) {
            return {
                success: false,
                action: 'delete_client',
                message: '❌ Cliente no encontrado o no tienes permisos para eliminarlo',
                data: null
            };
        }

        if (client.estado === 0) {
            return {
                success: true,
                action: 'delete_client',
                message: `ℹ️ El cliente ${client.nombre} ${client.apellido} ya está eliminado`,
                data: client
            };
        }

        // Eliminar lógicamente (cambiar estado a 0)
        const deletedClient = await this.clientService.updateClientStatus(client.id, 0);

        return {
            success: true,
            action: 'delete_client',
            message: `🗑️ Cliente **${deletedClient.nombre} ${deletedClient.apellido}** eliminado exitosamente\n📱 ${deletedClient.telefono}`,
            data: deletedClient
        };
    }

    // Handler: Reactivar Cliente
    async handleReactivateClient(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier || params.clientIdentifier;

        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }

        // Buscar cliente por ID o teléfono (cualquier estado)
        const client = await this.clientService.findClientByIdOrPhone(identifier);

        if (!client) {
            return {
                success: false,
                action: 'activate_client',
                message: '❌ Cliente no encontrado',
                data: null
            };
        }

        if (client.estado === 1) {
            return {
                success: true,
                action: 'activate_client',
                message: `ℹ️ El cliente ${client.nombre} ${client.apellido} ya está activo`,
                data: client
            };
        }

        // Reactivar (cambiar estado a 1)
        const reactivatedClient = await this.clientService.updateClientStatus(client.id, 1);

        return {
            success: true,
            action: 'activate_client',
            message: `♻️ Cliente **${reactivatedClient.nombre} ${reactivatedClient.apellido}** reactivado exitosamente\n📱 ${reactivatedClient.telefono}`,
            data: reactivatedClient
        };
    }

    // Handler: Crear Agente
    async handleCreateAgent(commandData) {
        const params = commandData.command.parameters;
        const agentData = params.agentData || {};

        if (!agentData.telefono) {
            throw new Error('Teléfono del agente requerido');
        }

        if (!agentData.nombre) {
            throw new Error('Nombre del agente requerido');
        }

        console.log('👨‍💼 Creando agente con datos:', agentData);

        try {
            const agent = await this.userService.create({
                cargo_id: agentData.cargo_id || 1, // Usar el cargo_id enviado
                nombre: agentData.nombre,
                apellido: agentData.apellido || '',
                telefono: agentData.telefono,
                estado: 1
            });

            const cargoNombre = agent.cargo_id === 2 ? 'Gerente' : 'Agente';

            return {
                success: true,
                action: 'agent_created',
                message: `✅ ${cargoNombre} registrado exitosamente\n\n📋 **DATOS COMPLETOS:**\n👨‍💼 Nombre: ${agent.nombre} ${agent.apellido || ''}\n📱 Teléfono: ${agent.telefono}\n👔 Cargo: ${cargoNombre}\n📊 Estado: 🟢 Activo\n🆔 ID: ${agent.id}\n📅 Fecha de registro: ${new Date().toLocaleDateString()}`,
                data: agent,
                generateQR: false // No generar QR inmediatamente
            };

        } catch (error) {
            console.error('❌ Error creando agente:', error.message);
            throw new Error('Error registrando agente: ' + error.message);
        }
    }

    async handleUpdateAgent(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;
        const agentData = params.agentData || {};

        console.log(`✏️ Actualizando agente: ${identifier} con datos:`, agentData);

        try {
            if (!identifier) {
                throw new Error('Identificador del agente requerido');
            }

            if (!agentData || Object.keys(agentData).length === 0) {
                throw new Error('Datos de actualización requeridos');
            }

            // Buscar el usuario por ID o teléfono SIN FILTRAR POR ESTADO
            let user = null;
            
            // Si es un número, buscar por ID primero
            if (!isNaN(identifier)) {
                try {
                    console.log(`🔍 UpdateAgent: Buscando usuario por ID: ${identifier}`);
                    // Buscar por ID sin filtrar estado
                    const idResponse = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status-by-id/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    if (idResponse.data.success && idResponse.data.data) {
                        user = idResponse.data.data;
                        console.log(`✅ UpdateAgent: Usuario encontrado por ID: ${user.nombre}, Estado: ${user.estado}`);
                    }
                    
                    // Si no se encuentra por ID, buscar por teléfono sin filtrar estado
                    if (!user) {
                        const phoneResponse = await axios.get(
                            `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                            { 
                                timeout: 12000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        if (phoneResponse.data.success && phoneResponse.data.data) {
                            user = phoneResponse.data.data;
                        }
                    }
                } catch (error) {
                    console.log('❌ UpdateAgent: Error buscando por ID, intentando por teléfono:', error.message);
                }
            } else {
                // Buscar por teléfono sin filtrar estado
                try {
                    const response = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    if (response.data.success && response.data.data) {
                        user = response.data.data;
                    }
                } catch (error) {
                    console.log('❌ UpdateAgent: Error buscando por teléfono:', error.message);
                }
            }

            if (!user) {
                throw new Error(`Usuario con identificador ${identifier} no encontrado`);
            }

            // Preparar datos completos para la actualización (evitar campos null)
            const completeUpdateData = {
                nombre: agentData.nombre || user.nombre,
                apellido: agentData.apellido || user.apellido || '',
                telefono: agentData.telefono || user.telefono,
                cargo_id: agentData.cargo_id !== undefined ? agentData.cargo_id : user.cargo_id,
                estado: agentData.estado !== undefined ? agentData.estado : user.estado
            };

            console.log('📝 Datos completos para actualización:', completeUpdateData);

            // Actualizar los datos usando la API de BD
            const updateResponse = await axios.put(
                `${this.databaseUrl}/api/users/${user.id}`,
                completeUpdateData,
                { 
                    timeout: 12000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!updateResponse.data || !updateResponse.data.success) {
                const errorMsg = updateResponse.data?.error || 'Error desconocido actualizando usuario';
                throw new Error(`Error en API de BD: ${errorMsg}`);
            }

            const updatedAgent = updateResponse.data.data;

            const cargoNombre = updatedAgent.cargo_nombre || (updatedAgent.cargo_id === 2 ? 'Gerente' : 'Agente');

            return {
                success: true,
                action: 'agent_updated',
                message: `✅ ${cargoNombre} actualizado exitosamente\n\n📋 **DATOS ACTUALIZADOS:**\n👨‍💼 Nombre: ${updatedAgent.nombre} ${updatedAgent.apellido || ''}\n📱 Teléfono: ${updatedAgent.telefono}\n👔 Cargo: ${cargoNombre}\n📊 Estado: ${updatedAgent.estado === 1 ? '🟢 Activo' : '🔴 Inactivo'}\n🆔 ID: ${updatedAgent.id}\n📅 Última actualización: ${new Date().toLocaleDateString()}`,
                data: updatedAgent
            };

        } catch (error) {
            console.error('❌ Error actualizando agente:', error.message);
            
            // Mejor manejo de errores HTTP específicos
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                
                if (status === 500) {
                    throw new Error(`Error interno del servidor de BD: ${errorData?.error || 'Error desconocido'}`);
                } else if (status === 404) {
                    throw new Error(`Usuario no encontrado en la base de datos`);
                } else if (status === 400) {
                    throw new Error(`Datos inválidos: ${errorData?.error || 'Verificar los datos enviados'}`);
                } else {
                    throw new Error(`Error HTTP ${status}: ${errorData?.error || error.message}`);
                }
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error('No se puede conectar con la base de datos. Verificar conexión.');
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error('Timeout conectando con la base de datos. Inténtalo nuevamente.');
            } else {
                throw new Error('Error actualizando agente: ' + error.message);
            }
        }
    }

    // Handler: Listar Agentes
    async handleListAgents(commandData) {
        console.log('📋 Listando TODOS los agentes y gerentes');

        try {
            // Usar la API de base de datos directamente para obtener todos los usuarios
            const response = await axios.get(
                `${this.databaseUrl}/api/users`,
                { timeout: 10000 }
            );

            if (!response.data.success || !response.data.data || response.data.data.length === 0) {
                return {
                    success: true,
                    action: 'agents_listed',
                    message: '📋 No hay agentes ni gerentes registrados',
                    data: []
                };
            }

            const allUsers = response.data.data;

            console.log(`✅ Encontrados ${allUsers.length} usuarios en total`);

            const listMessage = allUsers.map((user, i) => {
                const cargoNombre = user.cargo_nombre || (user.cargo_id === 2 ? 'Gerente' : 'Agente');
                const estadoTexto = user.estado === 1 ? '🟢 Activo' : '🔴 Inactivo';
                
                return `${i + 1}. 👨‍💼 **${user.nombre} ${user.apellido || ''}**\n   📱 ${user.telefono}\n   👔 ${cargoNombre}\n   📊 ${estadoTexto}\n   🆔 ID: ${user.id}`;
            }).join('\n\n');

            return {
                success: true,
                action: 'agents_listed',
                message: `📊 **Personal del Sistema (${allUsers.length}):**\n\n${listMessage}`,
                data: allUsers
            };

        } catch (error) {
            console.error('❌ Error listando usuarios:', error.message);
            throw new Error('Error al listar agentes: ' + error.message);
        }
    }

    // Handler: Listar Agentes por Estado (activos/inactivos)
    async handleListAgentsByStatus(commandData) {
        const params = commandData.command.parameters;
        const status = params.status; // 1 para activos, 0 para inactivos

        console.log(`📋 Listando agentes ${status === 1 ? 'ACTIVOS' : 'INACTIVOS'}`);

        try {
            // Usar la nueva API para obtener usuarios por estado
            const response = await axios.get(
                `${this.databaseUrl}/api/users/by-status/${status}`,
                { timeout: 10000 }
            );

            if (!response.data.success || !response.data.data || response.data.data.length === 0) {
                const statusText = status === 1 ? 'activos' : 'inactivos';
                return {
                    success: true,
                    action: 'agents_listed_by_status',
                    message: `📋 No hay agentes ni gerentes ${statusText} registrados`,
                    data: []
                };
            }

            const users = response.data.data;
            const statusText = status === 1 ? 'ACTIVOS' : 'INACTIVOS';
            const statusEmoji = status === 1 ? '🟢' : '🔴';

            console.log(`✅ Encontrados ${users.length} usuarios ${statusText.toLowerCase()}`);

            const listMessage = users.map((user, i) => {
                const cargoNombre = user.cargo_nombre || (user.cargo_id === 2 ? 'Gerente' : 'Agente');
                const estadoTexto = status === 1 ? '🟢 Activo' : '🔴 Inactivo';
                
                return `${i + 1}. 👨‍💼 **${user.nombre} ${user.apellido || ''}**\n   📱 ${user.telefono}\n   👔 ${cargoNombre}\n   📊 ${estadoTexto}\n   🆔 ID: ${user.id}`;
            }).join('\n\n');

            return {
                success: true,
                action: 'agents_listed_by_status',
                message: `📊 **Agentes ${statusText} (${users.length}):**\n\n${listMessage}\n\n💡 *Ingresa el ID o teléfono del agente a ${status === 1 ? 'dar de BAJA' : 'dar de ALTA'}:*`,
                data: users
            };

        } catch (error) {
            console.error('❌ Error listando usuarios por estado:', error.message);
            throw new Error('Error al listar agentes por estado: ' + error.message);
        }
    }

    // Handler: Verificar Estado de Agente (para auto-detectar acción)
    async handleCheckAgentStatus(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;

        console.log(`🔍 Verificando estado de agente: ${identifier}`);

        try {
            if (!identifier) {
                throw new Error('Identificador del agente requerido');
            }

            // Buscar el usuario por ID o teléfono SIN FILTRAR POR ESTADO (para baja/alta)
            let user = null;
            
            // Si es un número, buscar por ID primero
            if (!isNaN(identifier)) {
                try {
                    console.log(`🔍 CommandProcessor: Buscando usuario por ID: ${identifier}`);
                    // Buscar por ID sin filtrar estado
                    const idResponse = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status-by-id/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    console.log(`📊 CommandProcessor: Respuesta API por ID:`, idResponse.data);
                    if (idResponse.data.success && idResponse.data.data) {
                        user = idResponse.data.data;
                        console.log(`✅ CommandProcessor: Usuario encontrado por ID: ${user.nombre}, Estado: ${user.estado}`);
                    }
                    
                    // Si no se encuentra por ID, buscar por teléfono sin filtrar estado
                    if (!user) {
                        console.log(`🔍 CommandProcessor: No encontrado por ID, buscando por teléfono: ${identifier}`);
                        const phoneResponse = await axios.get(
                            `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                            { 
                                timeout: 12000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        console.log(`📊 CommandProcessor: Respuesta API por teléfono:`, phoneResponse.data);
                        if (phoneResponse.data.success && phoneResponse.data.data) {
                            user = phoneResponse.data.data;
                            console.log(`✅ CommandProcessor: Usuario encontrado por teléfono: ${user.nombre}, Estado: ${user.estado}`);
                        }
                    }
                } catch (error) {
                    console.log('Error buscando por ID, intentando por teléfono:', error.message);
                }
            } else {
                // Buscar por teléfono sin filtrar estado
                try {
                    console.log(`🔍 CommandProcessor: Buscando directamente por teléfono: ${identifier}`);
                    const response = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    console.log(`📊 CommandProcessor: Respuesta API por teléfono directo:`, response.data);
                    if (response.data.success && response.data.data) {
                        user = response.data.data;
                        console.log(`✅ CommandProcessor: Usuario encontrado por teléfono directo: ${user.nombre}, Estado: ${user.estado}`);
                    }
                } catch (error) {
                    console.log('❌ Error buscando por teléfono:', error.message);
                }
            }

            if (!user) {
                console.log(`❌ CommandProcessor: Usuario con identificador ${identifier} no encontrado en ninguna búsqueda`);
                throw new Error(`Usuario con identificador ${identifier} no encontrado`);
            } else {
                console.log(`✅ CommandProcessor: Usuario final encontrado - ID: ${user.id}, Nombre: ${user.nombre}, Estado: ${user.estado}`);
            }

            // Detectar estado actual y preparar mensaje de confirmación
            const currentStatus = user.estado;
            const isActive = currentStatus === 1;
            const cargoNombre = user.cargo_nombre || (user.cargo_id === 2 ? 'Gerente' : 'Agente');
            const statusEmoji = isActive ? '🟢' : '🔴';
            const statusText = isActive ? 'Activo' : 'Inactivo';
            
            // Determinar la acción a realizar (contraria al estado actual)
            const actionToTake = isActive ? 'deactivate' : 'activate';
            const actionText = isActive ? 'DAR DE BAJA' : 'DAR DE ALTA';
            const futureText = isActive ? 'DESACTIVADO' : 'ACTIVADO';
            
            // Mensaje de confirmación específico según el estado
            const confirmMsg = isActive 
                ? `⚠️ CONFIRMA: Se dará de BAJA al ${cargoNombre.toLowerCase()} y se cerrará su sesión.\n\n👨‍💼 ${user.nombre} ${user.apellido || ''}\n📊 Estado actual: ${statusEmoji} ${statusText}\n📱 ${user.telefono}\n\n1. Sí, dar de BAJA\n2. Cancelar`
                : `✅ CONFIRMA: Se dará de ALTA al ${cargoNombre.toLowerCase()} y podrá acceder al sistema.\n\n👨‍💼 ${user.nombre} ${user.apellido || ''}\n📊 Estado actual: ${statusEmoji} ${statusText}\n📱 ${user.telefono}\n\n1. Sí, dar de ALTA\n2. Cancelar`;

            console.log(`✅ Usuario encontrado: ${user.nombre}, Estado actual: ${statusText}, Acción a realizar: ${actionText}`);

            return {
                success: true,
                action: 'agent_status_checked',
                message: confirmMsg,
                data: {
                    user: user,
                    currentStatus: isActive,
                    actionToTake: actionToTake,
                    actionText: actionText
                },
                requiresConfirmation: true,
                nextAction: {
                    type: 'toggle_agent_confirmed',
                    identifier: identifier,
                    action: actionToTake
                }
            };

        } catch (error) {
            console.error('❌ Error verificando estado de agente:', error.message);
            
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                
                if (status === 500) {
                    throw new Error(`Error interno del servidor de BD: ${errorData?.error || 'Error desconocido'}`);
                } else if (status === 404) {
                    throw new Error(`Usuario no encontrado en la base de datos`);
                } else {
                    throw new Error(`Error HTTP ${status}: ${errorData?.error || error.message}`);
                }
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error('No se puede conectar con la base de datos. Verificar conexión.');
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error('Timeout conectando con la base de datos. Inténtalo nuevamente.');
            } else {
                throw new Error('Error verificando estado: ' + error.message);
            }
        }
    }

    // Handler: Cambiar Estado de Agente (Alta/Baja)
    async handleToggleAgent(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;
        const action = params.action; // 'activate' o 'deactivate'

        console.log(`🔄 ToggleAgent: Cambiando estado de agente: ${identifier} -> ${action}`);

        try {
            if (!identifier) {
                throw new Error('Identificador del agente requerido');
            }

            if (!action || !['activate', 'deactivate'].includes(action)) {
                throw new Error('Acción inválida. Debe ser "activate" o "deactivate"');
            }

            // Buscar el usuario por ID o teléfono SIN FILTRAR POR ESTADO (igual que check_agent_status)
            let user = null;
            
            // Si es un número, buscar por ID primero
            if (!isNaN(identifier)) {
                try {
                    console.log(`🔍 ToggleAgent: Buscando usuario por ID: ${identifier}`);
                    // Buscar por ID sin filtrar estado
                    const idResponse = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status-by-id/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    console.log(`📊 ToggleAgent: Respuesta API por ID:`, idResponse.data);
                    if (idResponse.data.success && idResponse.data.data) {
                        user = idResponse.data.data;
                        console.log(`✅ ToggleAgent: Usuario encontrado por ID: ${user.nombre}, Estado: ${user.estado}`);
                    }
                    
                    // Si no se encuentra por ID, buscar por teléfono sin filtrar estado
                    if (!user) {
                        console.log(`🔍 ToggleAgent: No encontrado por ID, buscando por teléfono: ${identifier}`);
                        const phoneResponse = await axios.get(
                            `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                            { 
                                timeout: 12000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        console.log(`📊 ToggleAgent: Respuesta API por teléfono:`, phoneResponse.data);
                        if (phoneResponse.data.success && phoneResponse.data.data) {
                            user = phoneResponse.data.data;
                            console.log(`✅ ToggleAgent: Usuario encontrado por teléfono: ${user.nombre}, Estado: ${user.estado}`);
                        }
                    }
                } catch (error) {
                    console.log('❌ ToggleAgent: Error buscando por ID, intentando por teléfono:', error.message);
                }
            } else {
                // Buscar por teléfono sin filtrar estado
                try {
                    console.log(`🔍 ToggleAgent: Buscando directamente por teléfono: ${identifier}`);
                    const response = await axios.get(
                        `${this.databaseUrl}/api/users/find-any-status/${identifier}`,
                        { 
                            timeout: 12000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    console.log(`📊 ToggleAgent: Respuesta API por teléfono directo:`, response.data);
                    if (response.data.success && response.data.data) {
                        user = response.data.data;
                        console.log(`✅ ToggleAgent: Usuario encontrado por teléfono directo: ${user.nombre}, Estado: ${user.estado}`);
                    }
                } catch (error) {
                    console.log('❌ ToggleAgent: Error buscando por teléfono:', error.message);
                }
            }

            if (!user) {
                console.log(`❌ ToggleAgent: Usuario con identificador ${identifier} no encontrado en ninguna búsqueda`);
                throw new Error(`Usuario con identificador ${identifier} no encontrado`);
            } else {
                console.log(`✅ ToggleAgent: Usuario final encontrado - ID: ${user.id}, Nombre: ${user.nombre}, Estado: ${user.estado}`);
            }

            // Preparar datos completos para la actualización (evitar campos null)
            const newStatus = action === 'activate' ? 1 : 0;
            const completeUpdateData = {
                nombre: user.nombre,
                apellido: user.apellido || '',
                telefono: user.telefono,
                cargo_id: user.cargo_id,
                estado: newStatus
            };

            console.log(`📝 Cambiando estado de ${user.nombre} a:`, newStatus === 1 ? 'ACTIVO' : 'INACTIVO');
            console.log('📝 Datos completos para actualización:', completeUpdateData);
            
            const updateResponse = await axios.put(
                `${this.databaseUrl}/api/users/${user.id}`,
                completeUpdateData,
                { 
                    timeout: 12000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!updateResponse.data || !updateResponse.data.success) {
                const errorMsg = updateResponse.data?.error || 'Error desconocido cambiando estado';
                throw new Error(`Error en API de BD: ${errorMsg}`);
            }

            const updatedUser = updateResponse.data.data;

            const actionText = action === 'activate' ? 'ACTIVADO' : 'DESACTIVADO';
            const statusEmoji = newStatus === 1 ? '🟢' : '🔴';
            const cargoNombre = updatedUser.cargo_nombre || (updatedUser.cargo_id === 2 ? 'Gerente' : 'Agente');

            let whatsappMessage = '';
            let generateQR = false;

            // 🆕 SI SE ESTÁ ACTIVANDO, MARCAR PARA CONFIGURACIÓN WHATSAPP POSTERIOR
            if (action === 'activate') {
                whatsappMessage = '\n\n📱 **WHATSAPP:** Se configurará tu acceso al sistema';
                generateQR = false;
                
                // Este resultado se usará en el backend principal para configurar WhatsApp
            }
            // 🆕 SI SE ESTÁ DESACTIVANDO, CERRAR SESIÓN WHATSAPP AUTOMÁTICAMENTE
            else if (action === 'deactivate') {
                await this.closeWhatsAppSession(updatedUser);
                whatsappMessage = '\n\n🚫 **WHATSAPP:** Sesión cerrada - sin acceso al sistema';
            }

            const result = {
                success: true,
                action: 'agent_toggled',
                message: `✅ ${cargoNombre} ${actionText} exitosamente\n\n📋 **DATOS COMPLETOS:**\n👨‍💼 Nombre: ${updatedUser.nombre} ${updatedUser.apellido || ''}\n📱 Teléfono: ${updatedUser.telefono}\n👔 Cargo: ${cargoNombre}\n📊 Estado: ${statusEmoji} ${newStatus === 1 ? 'Activo' : 'Inactivo'}\n🆔 ID: ${updatedUser.id}\n📅 Cambio de estado: ${new Date().toLocaleDateString()}${whatsappMessage}`,
                data: updatedUser,
                generateQR: generateQR
            };

            // Agregar información para configuración WhatsApp si es activación
            if (action === 'activate') {
                result.needsWhatsAppSetup = {
                    agentId: updatedUser.id,
                    agentPhone: updatedUser.telefono,
                    agentName: `${updatedUser.nombre} ${updatedUser.apellido || ''}`.trim(),
                    cargoNombre: cargoNombre,
                    isReactivation: true,
                    managerPhone: commandData.user.phone // ✅ Teléfono del gerente que está reactivando
                };
            }

            return result;

        } catch (error) {
            console.error('❌ Error cambiando estado de agente:', error.message);
            
            // Mejor manejo de errores HTTP específicos
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                
                if (status === 500) {
                    throw new Error(`Error interno del servidor de BD: ${errorData?.error || 'Error desconocido'}`);
                } else if (status === 404) {
                    throw new Error(`Usuario no encontrado en la base de datos`);
                } else if (status === 400) {
                    throw new Error(`Datos inválidos: ${errorData?.error || 'Verificar el identificador del usuario'}`);
                } else {
                    throw new Error(`Error HTTP ${status}: ${errorData?.error || error.message}`);
                }
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error('No se puede conectar con la base de datos. Verificar conexión.');
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error('Timeout conectando con la base de datos. Inténtalo nuevamente.');
            } else {
                throw new Error('Error cambiando estado: ' + error.message);
            }
        }
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

    // Crear sesión de WhatsApp para un agente/gerente nuevo
    async createWhatsAppSession(agent) {
        try {
            console.log(`📱 Creando sesión WhatsApp para: ${agent.nombre} (${agent.telefono})`);
            
            const whatsappUrl = process.env.WHATSAPP_URL || 'http://localhost:3001';
            const axios = require('axios');
            
            // Usar SOLO el número
            const sessionType = agent.telefono.replace(/[^\d]/g, '');
            const userName = `${agent.nombre} ${agent.apellido || ''}`.trim();
            
            // Crear sesión individual en el módulo WhatsApp
            const response = await axios.post(
                `${whatsappUrl}/api/sessions/create`,
                {
                    sessionType: sessionType,
                    phone: agent.telefono,
                    name: userName
                },
                { timeout: 30000 }
            );
            
            if (response.data.success) {
                console.log(`✅ Sesión WhatsApp creada para ${agent.nombre}`);
                
                // 🆕 ENVIAR QR VÍA WHATSAPP AL NUEVO AGENTE
                await this.sendQRToAgent(agent, sessionType);
                
                return response.data;
            } else {
                console.error(`❌ Error creando sesión WhatsApp para ${agent.nombre}:`, response.data.error);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error conectando con módulo WhatsApp para ${agent.nombre}:`, error.message);
            // No lanzar error para no interrumpir el registro del agente
            return null;
        }
    }

    // Cerrar sesión de WhatsApp para un agente desactivado
    async closeWhatsAppSession(agent) {
        try {
            console.log(`🚫 Cerrando sesión WhatsApp para: ${agent.nombre} (${agent.telefono})`);
            
            const whatsappUrl = process.env.WHATSAPP_URL || 'http://localhost:3001';
            const axios = require('axios');
            
            // Usar SOLO el número
            const sessionType = agent.telefono.replace(/[^\d]/g, '');
            
            // Cerrar sesión individual en el módulo WhatsApp Y eliminar archivos de autenticación
            const response = await axios.post(
                `${whatsappUrl}/api/sessions/${sessionType}/stop`,
                {
                    removeAuth: true,    // Eliminar archivos de autenticación
                    phone: agent.telefono
                },
                { timeout: 8000 }
            );
            
            if (response.data.success) {
                console.log(`✅ Sesión WhatsApp cerrada para ${agent.nombre}`);
                return response.data;
            } else {
                console.warn(`⚠️ Error cerrando sesión WhatsApp para ${agent.nombre}:`, response.data.error);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error conectando con módulo WhatsApp para cerrar sesión de ${agent.nombre}:`, error.message);
            // No lanzar error para no interrumpir el proceso de desactivación
            return null;
        }
    }

    // Enviar QR code por WhatsApp al nuevo agente
    async sendQRToAgent(agent, sessionType) {
        try {
            console.log(`📲 Enviando QR por WhatsApp a: ${agent.nombre} (${agent.telefono})`);
            
            const whatsappUrl = process.env.WHATSAPP_URL || 'http://localhost:3001';
            const axios = require('axios');
            
            // Esperar un poco para que el QR esté disponible
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Obtener el QR code
            const qrResponse = await axios.get(
                `${whatsappUrl}/api/sessions/${sessionType}/qr`,
                { timeout: 10000 }
            );
            
            if (qrResponse.data.success && qrResponse.data.data.qr) {
                const cargoNombre = agent.cargo_id === 2 ? 'Gerente' : 'Agente';
                const welcomeMessage = `🎉 ¡Bienvenido/a ${agent.nombre}!

Eres el nuevo ${cargoNombre} de RE/MAX y tu cuenta ha sido creada exitosamente.

📱 **CONFIGURACIÓN WHATSAPP:**
Para conectar tu sesión de WhatsApp al sistema, sigue estos pasos:

1️⃣ Abre WhatsApp Web en tu celular
2️⃣ Escanea el código QR que aparece a continuación
3️⃣ Tu sesión quedará conectada al sistema

🔗 **Tu sesión:** ${sessionType}
📞 **Tu teléfono:** ${agent.telefono}

*El código QR estará disponible en el sistema. Contacta al administrador si necesitas ayuda.*`;

                // Enviar mensaje via sistema (usando sesión system)
                const sendResponse = await axios.post(
                    `${whatsappUrl}/api/system/send`,
                    {
                        to: agent.telefono,
                        message: welcomeMessage
                    },
                    { timeout: 12000 }
                );
                
                if (sendResponse.data.success) {
                    console.log(`✅ QR enviado exitosamente a ${agent.nombre}`);
                } else {
                    console.warn(`⚠️ Error enviando QR a ${agent.nombre}:`, sendResponse.data.error);
                }
                
            } else {
                console.warn(`⚠️ QR no disponible para ${agent.nombre}, sesión: ${sessionType}`);
            }
            
        } catch (error) {
            console.error(`❌ Error enviando QR a ${agent.nombre}:`, error.message);
            // No lanzar error - es funcionalidad adicional
        }
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

    // Handler: Eliminar Propiedad (eliminación lógica)
    async handleDeleteProperty(commandData) {
        const params = commandData.command.parameters;
        const propertyId = params.propertyId || params.id;
        
        if (!propertyId) {
            throw new Error('ID de propiedad es requerido para eliminar');
        }

        // Buscar propiedad primero (sin filtrar estado)
        const property = await this.propertyService.getByIdAnyStatus(propertyId);
        if (!property) {
            throw new Error(`Propiedad ${propertyId} no encontrada`);
        }

        if (property.estado === 0) {
            throw new Error(`Propiedad ${propertyId} ya está eliminada`);
        }

        // Eliminar (cambiar estado a 0)
        await this.propertyService.delete(propertyId);

        return {
            success: true,
            action: 'property_deleted',
            message: `🗑️ **Propiedad eliminada**\n\n📋 **INFORMACIÓN:**\n🆔 ID: ${property.id}\n🏠 Nombre: ${property.nombre_propiedad}\n📍 Ubicación: ${property.ubicacion}\n👨‍💼 Eliminada por: ${commandData.user.name}\n📅 Fecha: ${new Date().toLocaleDateString()}\n\n⚠️ La propiedad está ahora inactiva en el sistema`
        };
    }

    // Handler: Activar Propiedad (reactivación lógica)
    async handleActivateProperty(commandData) {
        const params = commandData.command.parameters;
        const propertyId = params.propertyId || params.id;
        
        if (!propertyId) {
            throw new Error('ID de propiedad es requerido para activar');
        }

        // Buscar propiedad primero (sin filtrar estado)
        const property = await this.propertyService.getByIdAnyStatus(propertyId);
        if (!property) {
            throw new Error(`Propiedad ${propertyId} no encontrada`);
        }

        if (property.estado === 1) {
            throw new Error(`Propiedad ${propertyId} ya está activa`);
        }

        // Reactivar (cambiar estado a 1)
        await this.propertyService.toggleStatus(propertyId);

        return {
            success: true,
            action: 'property_activated',
            message: `✅ **Propiedad reactivada**\n\n📋 **INFORMACIÓN:**\n🆔 ID: ${property.id}\n🏠 Nombre: ${property.nombre_propiedad}\n📍 Ubicación: ${property.ubicacion}\n👨‍💼 Reactivada por: ${commandData.user.name}\n📅 Fecha: ${new Date().toLocaleDateString()}\n\n🟢 La propiedad está nuevamente activa en el sistema`
        };
    }

    // Handler: Buscar por Tipo de Operación
    async handleSearchByOperation(commandData) {
        const params = commandData.command.parameters;
        const tipoOperacion = params.operationType?.toLowerCase();
        
        if (!tipoOperacion) {
            throw new Error('Tipo de operación es requerido (venta/alquiler/venta o alquiler)');
        }

        // Mapear nombres a IDs (basado en dbremax.sql)
        let tipoOperacionId;
        if (tipoOperacion === 'venta') {
            tipoOperacionId = 1;
        } else if (tipoOperacion === 'alquiler') {
            tipoOperacionId = 2;
        } else if (tipoOperacion === 'venta o alquiler') {
            tipoOperacionId = 3;
        } else {
            throw new Error('Tipo de operación inválido. Use: venta, alquiler, o "venta o alquiler"');
        }

        const properties = await this.propertyService.searchByOperationType(tipoOperacionId);

        if (!properties || properties.length === 0) {
            return {
                success: true,
                action: 'search_results',
                message: `📋 **Búsqueda por operación: ${tipoOperacion.toUpperCase()}**\n\n❌ No se encontraron propiedades para esta operación`
            };
        }

        let message = `📋 **Búsqueda por operación: ${tipoOperacion.toUpperCase()}**\n\n🏠 **${properties.length} propiedad(es) encontrada(s):**\n\n`;
        
        properties.slice(0, 10).forEach((prop, index) => {
            const displayId = `${prop.id}`;
            message += `${index + 1}. **${displayId}** - ${prop.nombre_propiedad}\n`;
            message += `   📍 ${prop.ubicacion}\n`;
            message += `   ${PropertyModel.formatPriceByOperationType(prop)}\n`;
            message += `   🏗️ Tipo: ${prop.tipo_propiedad_nombre}\n`;
            message += `   📊 Estado: ${prop.estado_propiedad_nombre}\n\n`;
        });

        if (properties.length > 10) {
            message += `\n... y ${properties.length - 10} propiedades más`;
        }

        return {
            success: true,
            action: 'search_results',
            message: message
        };
    }

    // Handler: Buscar por Tipo de Propiedad
    async handleSearchByPropertyType(commandData) {
        const params = commandData.command.parameters;
        const tipoPropiedad = params.propertyType;
        
        if (!tipoPropiedad) {
            throw new Error('Tipo de propiedad es requerido (casa/departamento/terreno/oficina/local)');
        }

        const properties = await this.propertyService.searchByPropertyType(tipoPropiedad);

        if (!properties || properties.length === 0) {
            return {
                success: true,
                action: 'search_results',
                message: `📋 **Búsqueda por tipo: ${tipoPropiedad.toUpperCase()}**\n\n❌ No se encontraron propiedades de este tipo`
            };
        }

        let message = `📋 **Búsqueda por tipo: ${tipoPropiedad.toUpperCase()}**\n\n🏠 **${properties.length} propiedad(es) encontrada(s):**\n\n`;
        
        properties.slice(0, 10).forEach((prop, index) => {
            const displayId = `${prop.id}`;
            message += `${index + 1}. **${displayId}** - ${prop.nombre_propiedad}\n`;
            message += `   📍 ${prop.ubicacion}\n`;
            message += `   ${PropertyModel.formatPriceByOperationType(prop)}\n`;
            message += `   🎯 Operación: ${prop.tipo_operacion_nombre}\n`;
            message += `   📊 Estado: ${prop.estado_propiedad_nombre}\n\n`;
        });

        if (properties.length > 10) {
            message += `\n... y ${properties.length - 10} propiedades más`;
        }

        return {
            success: true,
            action: 'search_results',
            message: message
        };
    }

    // Handler: Buscar por Estado de Propiedad
    async handleSearchByStatus(commandData) {
        const params = commandData.command.parameters;
        const estadoPropiedad = params.status;
        
        if (!estadoPropiedad) {
            throw new Error('Estado de propiedad es requerido (disponible/reservada/vendida/alquilada)');
        }

        const properties = await this.propertyService.searchByPropertyStatus(estadoPropiedad);

        if (!properties || properties.length === 0) {
            return {
                success: true,
                action: 'search_results',
                message: `📋 **Búsqueda por estado: ${estadoPropiedad.toUpperCase()}**\n\n❌ No se encontraron propiedades con este estado`
            };
        }

        let message = `📋 **Búsqueda por estado: ${estadoPropiedad.toUpperCase()}**\n\n🏠 **${properties.length} propiedad(es) encontrada(s):**\n\n`;
        
        properties.slice(0, 10).forEach((prop, index) => {
            const displayId = `${prop.id}`;
            message += `${index + 1}. **${displayId}** - ${prop.nombre_propiedad}\n`;
            message += `   📍 ${prop.ubicacion}\n`;
            message += `   ${PropertyModel.formatPriceByOperationType(prop)}\n`;
            message += `   🏗️ Tipo: ${prop.tipo_propiedad_nombre}\n`;
            message += `   🎯 Operación: ${prop.tipo_operacion_nombre}\n\n`;
        });

        if (properties.length > 10) {
            message += `\n... y ${properties.length - 10} propiedades más`;
        }

        return {
            success: true,
            action: 'search_results',
            message: message
        };
    }

    // ==================== HANDLERS DE ENVÍO MASIVO ====================

    // Handler para envío masivo a todos los clientes del agente
    async handleBroadcastClients(commandData) {
        console.log('📤 Procesando envío masivo a clientes del agente');

        try {
            // Obtener mensaje de diferentes fuentes (comando directo vs menú)
            let mensaje = '';
            
            if (commandData.command && commandData.command.params) {
                // Comando directo: ENVIAR CLIENTES mensaje
                mensaje = commandData.command.params.join(' ').trim();
            } else if (commandData.command && commandData.command.parameters && commandData.command.parameters.message) {
                // Desde menú interactivo (executeCommand)
                mensaje = commandData.command.parameters.message.trim();
            } else if (commandData.actionData && commandData.actionData.mensaje) {
                // Desde menú interactivo alternativo
                mensaje = commandData.actionData.mensaje.trim();
            } else if (commandData.message) {
                // Mensaje directo
                mensaje = commandData.message.trim();
            }
            
            console.log(`🔍 DEBUG - Mensaje extraído: "${mensaje}"`);
            console.log(`🔍 DEBUG - commandData.command:`, commandData.command);
            
            if (!mensaje) {
                throw new Error('Debe especificar el mensaje a enviar');
            }

            // Validar longitud del mensaje
            if (mensaje.length > 1000) {
                throw new Error('El mensaje es demasiado largo (máximo 1000 caracteres)');
            }

            const agentId = commandData.user.id;
            // Limpiar el número de teléfono del agente (quitar @c.us si existe)
            const agentPhone = commandData.user.phone.replace('@c.us', '');

            console.log(`🔍 DEBUG - agentPhone limpiado: "${agentPhone}"`);

            // Verificar que el agente tenga una sesión WhatsApp activa
            try {
                const sessionCheckResponse = await axios.get('http://localhost:3001/api/sessions/status', { 
                    timeout: 5000 
                });
                
                const sessions = sessionCheckResponse.data?.data?.status || {};
                const agentSession = sessions[agentPhone];
                
                if (!agentSession || agentSession.status !== 'ready') {
                    throw new Error(`Tu sesión WhatsApp no está conectada. Por favor, conecta tu WhatsApp antes de enviar mensajes masivos.`);
                }
                
                console.log(`✅ Sesión WhatsApp verificada para agente: ${agentPhone}`);
            } catch (sessionError) {
                console.error(`❌ Error verificando sesión WhatsApp: ${sessionError.message}`);
                throw new Error(`Error de conectividad WhatsApp: ${sessionError.message}`);
            }

            // Obtener clientes del agente
            const clients = await this.clientService.getByAgent(agentId);
            
            if (clients.length === 0) {
                return {
                    success: true,
                    action: 'broadcast_info',
                    message: '📋 No tienes clientes asignados para envío masivo'
                };
            }

            // Limitar cantidad de clientes por seguridad
            if (clients.length > 50) {
                return {
                    success: false,
                    action: 'broadcast_error',
                    message: `❌ Demasiados clientes (${clients.length}). Máximo 50 por envío masivo. Usa filtros para reducir la cantidad.`
                };
            }

            // Preparar datos para envío masivo
            const broadcastData = {
                agentPhone: agentPhone,
                message: `🏡 *REMAX EXPRESS* 🏡\n\n${mensaje}\n\n📞 Contacta conmigo para más información`,
                delayBetweenMessages: this.calculateOptimalDelay(clients.length),
                clients: clients
            };

            // Realizar envío masivo con mejores prácticas anti-bloqueo
            const result = await this.performBroadcastWithAntiBlock(broadcastData);

            return {
                success: true,
                action: 'broadcast_completed',
                message: `✅ **Envío masivo completado**\n\n📊 **Estadísticas:**\n• Clientes objetivo: ${clients.length}\n• Mensajes enviados: ${result.sent}\n• Errores: ${result.errors}\n• Tiempo total: ${result.duration}s\n\n💡 Recomendación: Espera al menos 2 horas antes del próximo envío masivo`,
                data: result
            };

        } catch (error) {
            console.error('❌ Error en broadcast_clients:', error.message);
            throw error;
        }
    }

    // Handler para envío masivo filtrado
    async handleBroadcastClientsFiltered(commandData) {
        console.log('📤 Procesando envío masivo filtrado a clientes');

        try {
            let filtro = '';
            let mensaje = '';
            
            if (commandData.command && commandData.command.params && commandData.command.params.length >= 2) {
                // Comando directo: ENVIAR CLIENTES FILTRADOS [filtro] [mensaje]
                filtro = commandData.command.params[0].toLowerCase();
                mensaje = commandData.command.params.slice(1).join(' ').trim();
            } else if (commandData.command && commandData.command.parameters && commandData.command.parameters.message) {
                // Desde menú interactivo (executeCommand) - usar filtro "activos" por defecto
                filtro = commandData.command.parameters.filter || 'activos';
                mensaje = commandData.command.parameters.message.trim();
            } else if (commandData.actionData) {
                // Desde menú interactivo alternativo
                filtro = commandData.actionData.filtro ? commandData.actionData.filtro.toLowerCase() : '';
                mensaje = commandData.actionData.mensaje ? commandData.actionData.mensaje.trim() : '';
            } else if (commandData.message) {
                // Mensaje desde menú - asumir filtro "activos" por defecto
                filtro = 'activos';
                mensaje = commandData.message.trim();
            }
            
            if (!filtro) {
                throw new Error('Debe especificar el filtro (activos, con-email, recientes)');
            }
            
            if (!mensaje) {
                throw new Error('Debe especificar el mensaje a enviar');
            }

            const agentId = commandData.user.id;
            // Limpiar el número de teléfono del agente (quitar @c.us si existe)
            const agentPhone = commandData.user.phone.replace('@c.us', '');

            // Obtener y filtrar clientes
            let clients = await this.clientService.getByAgent(agentId);
            
            // Aplicar filtros
            switch(filtro) {
                case 'activos':
                    clients = clients.filter(c => c.estado === 1);
                    break;
                case 'con-email':
                    clients = clients.filter(c => c.email && c.email.trim());
                    break;
                case 'recientes':
                    const unaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    clients = clients.filter(c => new Date(c.fecha_creacion) >= unaSemanaAtras);
                    break;
                default:
                    throw new Error(`Filtro no válido: ${filtro}. Opciones: activos, con-email, recientes`);
            }

            if (clients.length === 0) {
                return {
                    success: true,
                    action: 'broadcast_info',
                    message: `📋 No se encontraron clientes con el filtro: ${filtro}`
                };
            }

            if (clients.length > 30) {
                return {
                    success: false,
                    action: 'broadcast_error',
                    message: `❌ Demasiados clientes filtrados (${clients.length}). Máximo 30 para envío filtrado.`
                };
            }

            // Preparar y realizar envío
            const broadcastData = {
                agentPhone: agentPhone,
                message: `🏡 *REMAX EXPRESS* 🏡\n\n${mensaje}\n\n📞 Contacta conmigo para más información`,
                delayBetweenMessages: this.calculateOptimalDelay(clients.length),
                clients: clients
            };

            const result = await this.performBroadcastWithAntiBlock(broadcastData);

            return {
                success: true,
                action: 'broadcast_completed',
                message: `✅ **Envío filtrado completado** (${filtro})\n\n📊 **Estadísticas:**\n• Clientes objetivo: ${clients.length}\n• Mensajes enviados: ${result.sent}\n• Errores: ${result.errors}\n• Tiempo total: ${result.duration}s`,
                data: result
            };

        } catch (error) {
            console.error('❌ Error en broadcast_clients_filtered:', error.message);
            throw error;
        }
    }

    // Handler para envío masivo personalizado (clientes seleccionados manualmente)
    async handleBroadcastClientsCustom(commandData) {
        console.log('📤 Procesando envío masivo personalizado (clientes seleccionados)');

        try {
            // Obtener mensaje y clientes seleccionados del menú
            let mensaje = '';
            let selectedClients = [];
            
            if (commandData.command && commandData.command.parameters) {
                // Desde menú interactivo (executeCommand)
                mensaje = commandData.command.parameters.message ? commandData.command.parameters.message.trim() : '';
                selectedClients = commandData.command.parameters.selectedClients || [];
            }
            
            console.log(`🔍 DEBUG - Mensaje: "${mensaje}"`);
            console.log(`🔍 DEBUG - Clientes seleccionados: ${selectedClients.length}`);
            
            if (!mensaje) {
                throw new Error('Debe especificar el mensaje a enviar');
            }

            if (!selectedClients || selectedClients.length === 0) {
                throw new Error('Debe seleccionar al menos un cliente');
            }

            // Validar longitud del mensaje
            if (mensaje.length > 1000) {
                throw new Error('El mensaje es demasiado largo (máximo 1000 caracteres)');
            }

            const agentId = commandData.user.id;
            // Limpiar el número de teléfono del agente (quitar @c.us si existe)
            const agentPhone = commandData.user.phone.replace('@c.us', '');

            console.log(`🔍 DEBUG - agentPhone limpiado: "${agentPhone}"`);

            // Verificar que el agente tenga una sesión WhatsApp activa
            try {
                const sessionCheckResponse = await axios.get('http://localhost:3001/api/sessions/status', { 
                    timeout: 5000 
                });
                
                const sessions = sessionCheckResponse.data?.data?.status || {};
                const agentSession = sessions[agentPhone];
                
                if (!agentSession || agentSession.status !== 'ready') {
                    throw new Error(`Tu sesión WhatsApp no está conectada. Por favor, conecta tu WhatsApp antes de enviar mensajes masivos.`);
                }
                
                console.log(`✅ Sesión WhatsApp verificada para agente: ${agentPhone}`);
            } catch (sessionError) {
                console.error(`❌ Error verificando sesión WhatsApp: ${sessionError.message}`);
                throw new Error(`Error de conectividad WhatsApp: ${sessionError.message}`);
            }

            // Limitar cantidad de clientes por seguridad
            if (selectedClients.length > 30) {
                return {
                    success: false,
                    action: 'broadcast_error',
                    message: `❌ Demasiados clientes seleccionados (${selectedClients.length}). Máximo 30 por envío personalizado.`
                };
            }

            // Preparar datos para envío masivo
            const broadcastData = {
                agentPhone: agentPhone,
                message: `🏡 *REMAX EXPRESS* 🏡\n\n${mensaje}\n\n📞 Contacta conmigo para más información`,
                delayBetweenMessages: this.calculateOptimalDelay(selectedClients.length),
                clients: selectedClients
            };

            // Realizar envío masivo con mejores prácticas anti-bloqueo
            const result = await this.performBroadcastWithAntiBlock(broadcastData);

            return {
                success: true,
                action: 'broadcast_completed',
                message: `✅ **Envío personalizado completado**\n\n📊 **Estadísticas:**\n• Clientes seleccionados: ${selectedClients.length}\n• Mensajes enviados: ${result.sent}\n• Errores: ${result.errors}\n• Tiempo total: ${result.duration}s\n\n💡 Recomendación: Espera al menos 2 horas antes del próximo envío masivo`,
                data: result
            };

        } catch (error) {
            console.error('❌ Error en broadcast_clients_custom:', error.message);
            throw error;
        }
    }

    // Handler para envío masivo a agentes (solo gerentes)
    async handleBroadcastAgents(commandData) {
        console.log('📤 Procesando envío masivo a agentes (gerente)');

        try {
            // Obtener mensaje de diferentes fuentes
            let mensaje = '';
            
            if (commandData.command && commandData.command.params) {
                // Comando directo: ENVIAR AGENTES mensaje
                mensaje = commandData.command.params.join(' ').trim();
            } else if (commandData.command && commandData.command.parameters && commandData.command.parameters.message) {
                // Desde menú interactivo (executeCommand)
                mensaje = commandData.command.parameters.message.trim();
            } else if (commandData.actionData && commandData.actionData.mensaje) {
                // Desde menú interactivo alternativo
                mensaje = commandData.actionData.mensaje.trim();
            } else if (commandData.message) {
                // Mensaje directo desde menú
                mensaje = commandData.message.trim();
            }
            
            if (!mensaje) {
                throw new Error('Debe especificar el mensaje a enviar');
            }

            // Limpiar el número de teléfono del gerente (quitar @c.us si existe)
            const gerentePhone = commandData.user.phone.replace('@c.us', '');

            // Obtener todos los agentes activos
            const agents = await this.userService.list({ cargo_id: 1, estado: 1 });
            
            if (agents.length === 0) {
                return {
                    success: true,
                    action: 'broadcast_info',
                    message: '📋 No hay agentes activos en el sistema'
                };
            }

            // Limitar cantidad
            if (agents.length > 20) {
                return {
                    success: false,
                    action: 'broadcast_error',
                    message: `❌ Demasiados agentes (${agents.length}). Máximo 20 por envío masivo.`
                };
            }

            // Preparar datos (convertir agentes a formato compatible)
            const agentsAsClients = agents.map(agent => ({
                nombre: agent.nombre,
                apellido: agent.apellido,
                telefono: agent.telefono
            }));

            const broadcastData = {
                agentPhone: gerentePhone,
                message: `👨‍💼 *MENSAJE GERENCIAL* 👨‍💼\n\n${mensaje}\n\n📞 Para consultas, contactar gerencia`,
                delayBetweenMessages: this.calculateOptimalDelay(agents.length, true), // Delay mayor para comunicación gerencial
                clients: agentsAsClients
            };

            const result = await this.performBroadcastWithAntiBlock(broadcastData);

            return {
                success: true,
                action: 'broadcast_completed',
                message: `✅ **Envío a equipo completado**\n\n📊 **Estadísticas:**\n• Agentes contactados: ${agents.length}\n• Mensajes enviados: ${result.sent}\n• Errores: ${result.errors}\n• Tiempo total: ${result.duration}s`,
                data: result
            };

        } catch (error) {
            console.error('❌ Error en broadcast_agents:', error.message);
            throw error;
        }
    }

    // ==================== MÉTODOS DE SOPORTE PARA ENVÍO MASIVO ====================

    // Calcular delay óptimo basado en cantidad y tipo
    calculateOptimalDelay(clientCount, isManagerial = false) {
        // Delays más conservadores para evitar bloqueos
        if (isManagerial) {
            return Math.max(5000, clientCount * 200); // Mínimo 5s para comunicación gerencial
        }
        
        if (clientCount <= 10) return 3000;  // 3 segundos para grupos pequeños
        if (clientCount <= 20) return 4000;  // 4 segundos para grupos medianos  
        if (clientCount <= 30) return 5000;  // 5 segundos para grupos grandes
        return 6000; // 6 segundos para grupos muy grandes
    }

    // Realizar broadcast con técnicas anti-bloqueo
    async performBroadcastWithAntiBlock(broadcastData) {
        console.log('🛡️ Iniciando envío masivo con protección anti-bloqueo...');
        
        const startTime = Date.now();
        let sent = 0;
        let errors = 0;
        const errorDetails = [];

        try {
            // Randomizar orden de envío para parecer más natural
            const shuffledClients = this.shuffleArray([...broadcastData.clients]);
            
            // Dividir en lotes pequeños
            const batchSize = 5;
            const batches = this.chunkArray(shuffledClients, batchSize);
            
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`📦 Procesando lote ${i + 1}/${batches.length} (${batch.length} clientes)`);
                
                // Procesar lote con variación en timing
                for (let j = 0; j < batch.length; j++) {
                    const client = batch[j];
                    
                    try {
                        // Limpiar el número del cliente (quitar @c.us si existe)
                        const clientPhone = client.telefono.replace('@c.us', '');
                        
                        // Llamar al endpoint de envío masivo del módulo WhatsApp
                        const response = await axios.post(
                            'http://localhost:3001/api/agent/send',
                            {
                                agentPhone: broadcastData.agentPhone,
                                to: clientPhone,
                                message: broadcastData.message
                            },
                            { timeout: 15000 }
                        );

                        if (response.data.success) {
                            sent++;
                            console.log(`  ✅ Enviado a ${client.nombre || client.telefono}`);
                        } else {
                            errors++;
                            errorDetails.push(`${client.nombre || client.telefono}: ${response.data.error}`);
                            console.log(`  ❌ Error enviando a ${client.telefono}: ${response.data.error}`);
                        }

                    } catch (sendError) {
                        errors++;
                        errorDetails.push(`${client.nombre || client.telefono}: ${sendError.message}`);
                        console.error(`  ❌ Excepción enviando a ${client.telefono}:`, sendError.message);
                    }

                    // Delay variable entre mensajes del mismo lote
                    if (j < batch.length - 1) {
                        const variableDelay = broadcastData.delayBetweenMessages + Math.random() * 1000;
                        await new Promise(resolve => setTimeout(resolve, variableDelay));
                    }
                }
                
                // Pausa más larga entre lotes
                if (i < batches.length - 1) {
                    const batchDelay = 10000 + Math.random() * 5000; // 10-15 segundos
                    console.log(`  ⏳ Pausa entre lotes: ${Math.round(batchDelay/1000)}s`);
                    await new Promise(resolve => setTimeout(resolve, batchDelay));
                }
            }

        } catch (error) {
            console.error('❌ Error crítico en broadcast:', error.message);
            throw error;
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log(`✅ Broadcast completado: ${sent} enviados, ${errors} errores en ${duration}s`);
        
        return {
            sent,
            errors,
            duration,
            errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 5) : null // Solo mostrar primeros 5 errores
        };
    }

    // Utilidades para anti-bloqueo
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    // ==================== MÉTODOS AUXILIARES ====================
    
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
}

module.exports = CommandProcessor;