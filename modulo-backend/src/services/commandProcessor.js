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
            nombre_propiedad: params.propertyData?.nombre_propiedad || 'Propiedad sin nombre',
            descripcion: params.propertyData?.descripcion || '',
            precio: params.propertyData?.precio || 0,
            ubicacion: params.propertyData?.ubicacion || '',
            superficie: params.propertyData?.superficie || '',
            dimensiones: params.propertyData?.dimensiones || '',
            tipo_propiedad: params.propertyData?.tipo_propiedad || 'casa',
            estado: 1
        };

        // Validar que los datos requeridos estén presentes
        if (!propertyData.nombre_propiedad || propertyData.nombre_propiedad === 'Propiedad sin nombre') {
            throw new Error('Nombre de la propiedad es requerido');
        }
        if (!propertyData.precio || propertyData.precio <= 0) {
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

        if (!params.updateData || Object.keys(params.updateData).length === 0) {
            throw new Error('Datos de actualización requeridos');
        }

        console.log('🔄 Actualizando propiedad:', params.propertyId, 'con datos:', params.updateData);

        try {
            const property = await this.propertyService.update(params.propertyId, params.updateData);

            if (!property) {
                throw new Error('No se pudo actualizar la propiedad');
            }

            return {
                success: true,
                action: 'property_updated',
                message: `✅ Propiedad actualizada correctamente\n\n🏠 **${property.nombre_propiedad}**\n📍 ${property.ubicacion}\n💰 ${property.precio.toLocaleString()} Bs\n\n✨ Cambios aplicados exitosamente`,
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
                `${i + 1}. 🏠 **${p.nombre_propiedad}**\n   📍 ${p.ubicacion}\n   💰 ${p.precio.toLocaleString()} Bs\n   🆔 ID: ${p.id}` :
                `${i + 1}. 🏠 ${p.nombre_propiedad}\n   📍 ${p.ubicacion}\n   💰 ${p.precio.toLocaleString()} Bs`
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
            message: `🏠 **${property.nombre_propiedad}**\n\n📍 ${property.ubicacion}\n💰 ${property.precio.toLocaleString()} Bs\n📏 Superficie: ${property.superficie || 'No especificada'}\n📐 Dimensiones: ${property.dimensiones || 'No especificadas'}\n🏠 Tipo: ${property.tipo_propiedad || 'No especificado'}\n\n📝 ${property.descripcion || 'Sin descripción'}`,
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
                // Word files will be converted to PDF
                organized.pdfs.push({...file, needsConversion: true, originalType: 'word'});
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
            // Procesar PDFs (incluye conversiones de Word)
            for (const file of organizedFiles.pdfs) {
                if (file.needsConversion) {
                    const convertedFile = await this.convertWordToPdf(file);
                    processed.pdfs.push({
                        ...convertedFile,
                        savedTo: 'modulo-ia/data/pdfs/',
                        converted: true
                    });
                    processed.conversions.push({
                        original: file.fileName,
                        converted: convertedFile.fileName
                    });
                } else {
                    processed.pdfs.push({
                        ...file,
                        savedTo: 'modulo-ia/data/pdfs/'
                    });
                }
            }

            // Procesar imágenes
            for (const file of organizedFiles.images) {
                processed.images.push({
                    ...file,
                    savedTo: 'media/images/'
                });
            }

            // Procesar documentos
            for (const file of organizedFiles.documents) {
                processed.documents.push({
                    ...file,
                    savedTo: 'media/documents/'
                });
            }

            // Procesar videos
            for (const file of organizedFiles.videos) {
                processed.videos.push({
                    ...file,
                    savedTo: 'media/videos/'
                });
            }

            // Procesar otros
            for (const file of organizedFiles.others) {
                processed.others.push({
                    ...file,
                    savedTo: 'media/others/'
                });
            }

        } catch (error) {
            console.error('❌ Error procesando archivos:', error.message);
            throw new Error('Error procesando archivos: ' + error.message);
        }

        return processed;
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
        
        if (counts.images > 0) summary.push(`📷 ${counts.images} imagen(es)`);
        if (counts.documents > 0) summary.push(`📄 ${counts.documents} documento(s)`);
        if (counts.videos > 0) summary.push(`🎥 ${counts.videos} video(s)`);
        if (counts.pdfs > 0) summary.push(`📑 ${counts.pdfs} PDF(s)`);
        if (counts.others > 0) summary.push(`📁 ${counts.others} otro(s)`);
        if (counts.conversions > 0) summary.push(`🔄 ${counts.conversions} conversión(es) Word→PDF`);

        return summary.join('\n') || '• Sin archivos procesados';
    }

    // Generar resumen de ubicaciones
    generateFileLocationsSummary(processedFiles) {
        const locations = [];
        
        if (processedFiles.pdfs.length > 0) {
            locations.push(`📑 PDFs → modulo-ia/data/pdfs/`);
        }
        if (processedFiles.images.length > 0) {
            locations.push(`📷 Imágenes → media/images/`);
        }
        if (processedFiles.documents.length > 0) {
            locations.push(`📄 Documentos → media/documents/`);
        }
        if (processedFiles.videos.length > 0) {
            locations.push(`🎥 Videos → media/videos/`);
        }
        if (processedFiles.others.length > 0) {
            locations.push(`📁 Otros → media/others/`);
        }

        return locations.join('\n') || '• Sin ubicaciones específicas';
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
                `${index + 1}. 🏠 **${prop.nombre_propiedad}**\n   📍 ${prop.ubicacion}\n   💰 ${prop.precio.toLocaleString()} Bs\n   🆔 ID: ${prop.id}`
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

    // Handler: Crear Cliente
    async handleCreateClient(commandData) {
        const params = commandData.command.parameters;
        const clientData = params.clientData || {};

        if (!clientData.telefono) {
            throw new Error('Teléfono del cliente requerido');
        }

        if (!clientData.nombre || !clientData.apellido) {
            throw new Error('Nombre y apellido del cliente son requeridos');
        }

        const client = await this.clientService.createOrUpdate({
            nombre: clientData.nombre,
            apellido: clientData.apellido,
            telefono: clientData.telefono,
            email: clientData.email || '',
            estado: 1
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
            message: `✅ Cliente actualizado exitosamente\n\n👤 ${client.nombre} ${client.apellido}\n📱 ${client.telefono}${client.email ? `\n📧 ${client.email}` : ''}`,
            data: client
        };
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

        const listMessage = clients.slice(0, 15).map((c, i) => {
            let clientInfo = `${i + 1}. 👤 ${c.nombre} ${c.apellido}\n   📱 ${c.telefono}`;
            if (c.email) {
                clientInfo += `\n   📧 ${c.email}`;
            }
            if (c.id) {
                clientInfo += `\n   🏷️ ID: ${c.id}`;
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
                message: `✅ ${cargoNombre} registrado exitosamente\n\n👨‍💼 ${agent.nombre} ${agent.apellido || ''}\n📱 ${agent.telefono}\n👔 ${cargoNombre}\n🆔 ID: ${agent.id}`,
                data: agent
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

            // Buscar el usuario por ID o teléfono usando la API de BD
            let user = null;
            
            // Si es un número, buscar por ID primero
            if (!isNaN(identifier)) {
                try {
                    // Buscar todos los usuarios y filtrar por ID
                    const response = await axios.get(`${this.databaseUrl}/api/users`, { 
                        timeout: 15000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (response.data.success) {
                        user = response.data.data.find(u => u.id === parseInt(identifier));
                    }
                    
                    // Si no se encuentra por ID, buscar por teléfono
                    if (!user) {
                        const phoneResponse = await axios.get(
                            `${this.databaseUrl}/api/users/validate/${identifier}`,
                            { 
                                timeout: 15000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        if (phoneResponse.data.valid) {
                            user = phoneResponse.data.data;
                        }
                    }
                } catch (error) {
                    console.log('Error buscando por ID, intentando por teléfono:', error.message);
                }
            } else {
                // Buscar por teléfono
                try {
                    const response = await axios.get(
                        `${this.databaseUrl}/api/users/validate/${identifier}`,
                        { 
                            timeout: 15000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    if (response.data.valid) {
                        user = response.data.data;
                    }
                } catch (error) {
                    console.log('Error buscando por teléfono:', error.message);
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
                    timeout: 15000,
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
                message: `✅ ${cargoNombre} actualizado exitosamente\n\n👨‍💼 ${updatedAgent.nombre} ${updatedAgent.apellido || ''}\n📱 ${updatedAgent.telefono}\n👔 ${cargoNombre}\n🆔 ID: ${updatedAgent.id}`,
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

    // Handler: Cambiar Estado de Agente (Alta/Baja)
    async handleToggleAgent(commandData) {
        const params = commandData.command.parameters;
        const identifier = params.identifier;
        const action = params.action; // 'activate' o 'deactivate'

        console.log(`🔄 Cambiando estado de agente: ${identifier} -> ${action}`);

        try {
            if (!identifier) {
                throw new Error('Identificador del agente requerido');
            }

            if (!action || !['activate', 'deactivate'].includes(action)) {
                throw new Error('Acción inválida. Debe ser "activate" o "deactivate"');
            }

            // Buscar el usuario por ID o teléfono usando la API de BD
            let user = null;
            
            // Si es un número, buscar por ID primero
            if (!isNaN(identifier)) {
                try {
                    // Buscar todos los usuarios y filtrar por ID
                    const response = await axios.get(`${this.databaseUrl}/api/users`, { 
                        timeout: 15000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (response.data.success) {
                        user = response.data.data.find(u => u.id === parseInt(identifier));
                    }
                    
                    // Si no se encuentra por ID, buscar por teléfono
                    if (!user) {
                        const phoneResponse = await axios.get(
                            `${this.databaseUrl}/api/users/validate/${identifier}`,
                            { 
                                timeout: 15000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        if (phoneResponse.data.valid) {
                            user = phoneResponse.data.data;
                        }
                    }
                } catch (error) {
                    console.log('Error buscando por ID, intentando por teléfono:', error.message);
                }
            } else {
                // Buscar por teléfono
                try {
                    const response = await axios.get(
                        `${this.databaseUrl}/api/users/validate/${identifier}`,
                        { 
                            timeout: 15000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    if (response.data.valid) {
                        user = response.data.data;
                    }
                } catch (error) {
                    console.log('Error buscando por teléfono:', error.message);
                }
            }

            if (!user) {
                throw new Error(`Usuario con identificador ${identifier} no encontrado`);
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
                    timeout: 15000,
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

            return {
                success: true,
                action: 'agent_toggled',
                message: `✅ ${cargoNombre} ${actionText} exitosamente\n\n👨‍💼 ${updatedUser.nombre} ${updatedUser.apellido || ''}\n📱 ${updatedUser.telefono}\n👔 ${cargoNombre}\n📊 Estado: ${statusEmoji} ${newStatus === 1 ? 'Activo' : 'Inactivo'}\n🆔 ID: ${updatedUser.id}`,
                data: updatedUser
            };

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
}

module.exports = CommandProcessor;