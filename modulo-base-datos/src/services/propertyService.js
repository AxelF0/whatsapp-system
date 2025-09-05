// servidor/modulo-base-datos/src/services/propertyService.js

const Joi = require('joi');

class PropertyService {
    constructor(propertyModel) {
        this.model = propertyModel;
        
        // Esquema de validación para propiedades
        this.propertyFileSchema = Joi.object({
            property_id: Joi.number().required(),
            file_type: Joi.string().valid('image', 'document', 'video').required(),
            file_name: Joi.string().required(),
            file_path: Joi.string().required(),
            file_size: Joi.number().required(),
            mime_type: Joi.string().required(),
            usuario_id: Joi.number().required()
        });

        this.propertySchema = Joi.object({
            usuario_id: Joi.number().required(),
            nombre_propiedad: Joi.string().max(200).required(),
            descripcion: Joi.string().max(1000).allow(''),
            precio: Joi.number().min(0).required(),
            ubicacion: Joi.string().max(255).required(),
            superficie: Joi.string().max(100).allow(''),
            dimensiones: Joi.string().max(100).allow(''),
            tipo_propiedad: Joi.string().valid('casa', 'departamento', 'terreno', 'oficina', 'local').default('casa'),
            estado: Joi.number().valid(0, 1).default(1)
        });

        // Cache simple para propiedades
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    }

    // Crear nueva propiedad
    async create(propertyData) {
        console.log('🏠 Creando nueva propiedad');

        try {
            // Validar datos
            const { error, value } = this.propertySchema.validate(propertyData);
            if (error) {
                throw new Error(`Validación fallida: ${error.details[0].message}`);
            }

            // Crear en base de datos usando el modelo directamente
            const property = await this.model.create(value);
            
            // Limpiar cache
            this.clearCache();
            
            console.log('✅ Propiedad creada:', property.id);
            return property;

        } catch (error) {
            console.error('❌ Error creando propiedad:', error.message);
            throw error;
        }
    }

    // Actualizar propiedad
    async update(propertyId, updates) {
        console.log('🔄 Actualizando propiedad:', propertyId);

        try {
            // Validar que la propiedad existe
            const existing = await this.getById(propertyId);
            if (!existing) {
                throw new Error(`Propiedad ${propertyId} no encontrada`);
            }

            // Validar actualizaciones
            const updateSchema = this.propertySchema.fork(
                Object.keys(this.propertySchema.describe().keys),
                (schema) => schema.optional()
            );

            const { error, value } = updateSchema.validate(updates);
            if (error) {
                throw new Error(`Validación fallida: ${error.details[0].message}`);
            }

            // Actualizar usando el modelo directamente
            const updatedProperty = await this.model.update(propertyId, value);
            
            // Limpiar cache
            this.clearCache();
            
            console.log('✅ Propiedad actualizada');
            return updatedProperty;

        } catch (error) {
            console.error('❌ Error actualizando propiedad:', error.message);
            throw error;
        }
    }

    // Eliminar propiedad (soft delete)
    async delete(propertyId) {
        console.log('🗑️ Eliminando propiedad:', propertyId);
    
        try {
            // Convertir ID si es necesario
            let id = propertyId;
            if (typeof propertyId === 'string' && propertyId.startsWith('PROP')) {
                id = parseInt(propertyId.replace('PROP', ''));
                if (isNaN(id)) {
                    throw new Error(`ID de propiedad inválido: ${propertyId}`);
                }
            }
    
            // Verificar que existe
            const existing = await this.getById(id);
            if (!existing) {
                throw new Error(`Propiedad ${propertyId} no encontrada`);
            }
    
            // Marcar como eliminada (soft delete) usando el modelo
            await this.model.softDelete(id);
            
            // Limpiar cache
            this.clearCache();
            
            console.log('✅ Propiedad eliminada');
            return true;
    
        } catch (error) {
            console.error('❌ Error eliminando propiedad:', error.message);
            throw error;
        }
    }

    // Obtener propiedad por ID
    async getById(propertyId) {
        console.log('🔍 Buscando propiedad:', propertyId);
    
        try {
            // Convertir ID si es necesario
            let id = propertyId;
            
            // Si el ID empieza con PROP, extraer el número
            if (typeof propertyId === 'string' && propertyId.startsWith('PROP')) {
                id = parseInt(propertyId.replace('PROP', ''));
                if (isNaN(id)) {
                    console.log('⚠️ ID inválido:', propertyId);
                    return null;
                }
            } else if (typeof propertyId === 'string') {
                id = parseInt(propertyId);
                if (isNaN(id)) {
                    console.log('⚠️ ID no numérico:', propertyId);
                    return null;
                }
            }
    
            // Verificar cache
            const cacheKey = `property_${id}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    console.log('✅ Propiedad obtenida del cache');
                    return cached.data;
                }
            }
    
            // Buscar en base de datos usando el modelo directamente
            const property = await this.model.findById(id);
            
            if (property) {
                // Guardar en cache
                this.cache.set(cacheKey, {
                    data: property,
                    timestamp: Date.now()
                });
                
                return property;
            } else {
                return null;
            }
    
        } catch (error) {
            console.error('❌ Error obteniendo propiedad:', error.message);
            return null;
        }
    }

    // Listar todas las propiedades
    async list(filters = {}) {
        console.log('📋 Listando propiedades');

        try {
            // Si no hay filtros, devolver todas
            if (!filters || Object.keys(filters).length === 0) {
                return await this.model.findAll();
            }
            
            // Si hay filtros, usar búsqueda personalizada
            return await this.model.findByMultipleFilters(filters);

        } catch (error) {
            console.error('❌ Error listando propiedades:', error.message);
            throw error;
        }
    }

    // Buscar TODAS las propiedades (sin filtros)
    async searchAll() {
        console.log('🔍 Buscando TODAS las propiedades del sistema');

        try {
            return await this.model.findAll();
        } catch (error) {
            console.error('❌ Error buscando todas las propiedades:', error.message);
            return [];
        }
    }

    // Buscar MIS propiedades (por usuario_id)
    async searchByUserId(usuario_id) {
        console.log('🔍 Buscando MIS propiedades para usuario:', usuario_id);

        try {
            return await this.model.findByUserId(usuario_id);
        } catch (error) {
            console.error('❌ Error buscando mis propiedades:', error.message);
            return [];
        }
    }

    // Buscar propiedades por PRECIO MÁXIMO
    async searchByMaxPrice(precio_max) {
        console.log('🔍 Buscando propiedades por precio máximo:', precio_max);

        try {
            return await this.model.findByMaxPrice(precio_max);
        } catch (error) {
            console.error('❌ Error buscando propiedades por precio:', error.message);
            return [];
        }
    }

    // Buscar propiedades por UBICACIÓN
    async searchByLocation(ubicacion) {
        console.log('🔍 Buscando propiedades por ubicación:', ubicacion);

        try {
            return await this.model.findByLocation(ubicacion);
        } catch (error) {
            console.error('❌ Error buscando propiedades por ubicación:', error.message);
            return [];
        }
    }

    // Buscar propiedades por TIPO
    async searchByType(tipo_propiedad) {
        console.log('🔍 Buscando propiedades por tipo:', tipo_propiedad);

        try {
            return await this.model.findByType(tipo_propiedad);
        } catch (error) {
            console.error('❌ Error buscando propiedades por tipo:', error.message);
            return [];
        }
    }

    // Buscar propiedades con filtros MÚLTIPLES (búsqueda personalizada)
    async searchCustom(filters) {
        console.log('🔍 Búsqueda personalizada con filtros:', filters);

        try {
            return await this.model.findByMultipleFilters(filters);
        } catch (error) {
            console.error('❌ Error en búsqueda personalizada:', error.message);
            return [];
        }
    }

    // Obtener propiedades de un agente
    async getByAgent(agentId) {
        console.log('👤 Obteniendo propiedades del agente:', agentId);

        try {
            return await this.model.findByUserId(agentId);
        } catch (error) {
            console.error('❌ Error obteniendo propiedades del agente:', error.message);
            return [];
        }
    }

    // Obtener top propiedades más consultadas
    async getTopProperties(limit = 10) {
        console.log('🏆 Obteniendo top propiedades');

        try {
            // Por ahora retornar las más recientes
            // En producción, esto debería basarse en métricas reales
            const properties = await this.list();
            return properties.slice(0, limit);

        } catch (error) {
            console.error('❌ Error obteniendo top propiedades:', error.message);
            return [];
        }
    }

    // Obtener estadísticas diarias
    async getDailyStats(date) {
        console.log('📊 Obteniendo estadísticas diarias:', date);

        try {
            // Simulación de estadísticas
            // En producción, esto vendría de la base de datos
            return {
                new: Math.floor(Math.random() * 5),
                queries: Math.floor(Math.random() * 20),
                visits: Math.floor(Math.random() * 10),
                shown: Math.floor(Math.random() * 30),
                top: await this.getTopProperties(3)
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }

    // Obtener estadísticas mensuales
    async getMonthlyStats(month, year) {
        console.log(`📊 Obteniendo estadísticas mensuales: ${month}/${year}`);

        try {
            // Simulación de estadísticas
            return {
                total: Math.floor(Math.random() * 50) + 10,
                sold: Math.floor(Math.random() * 10),
                conversionRate: Math.floor(Math.random() * 30) + 5,
                avgSaleTime: Math.floor(Math.random() * 60) + 15
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas mensuales:', error.message);
            return {};
        }
    }

    // Obtener ingresos mensuales
    async getMonthlyRevenue(month, year) {
        console.log(`💰 Calculando ingresos: ${month}/${year}`);

        try {
            // Simulación de ingresos
            return {
                total: Math.floor(Math.random() * 1000000) + 100000,
                commission: Math.floor(Math.random() * 50000) + 5000
            };

        } catch (error) {
            console.error('❌ Error calculando ingresos:', error.message);
            return { total: 0, commission: 0 };
        }
    }

    // Obtener estadísticas generales
    async getStats() {
        try {
            const properties = await this.list();
            
            return {
                total: properties.length,
                active: properties.filter(p => p.estado === 1).length,
                inactive: properties.filter(p => p.estado === 0).length,
                byType: this.groupByType(properties),
                avgPrice: this.calculateAvgPrice(properties)
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }

    // Agrupar por tipo
    groupByType(properties) {
        const groups = {};
        
        properties.forEach(p => {
            const type = p.tipo_propiedad || 'otros';
            groups[type] = (groups[type] || 0) + 1;
        });
        
        return groups;
    }

    // Calcular precio promedio
    calculateAvgPrice(properties) {
        if (properties.length === 0) return 0;
        
        const total = properties.reduce((sum, p) => sum + (p.precio || 0), 0);
        return Math.round(total / properties.length);
    }

    // Buscar propiedades con filtros (función general)
    async searchProperties(filters = {}) {
        console.log('🔍 Búsqueda general de propiedades:', filters);

        try {
            // Si no hay filtros, devolver todas las propiedades
            if (!filters || Object.keys(filters).length === 0) {
                return await this.model.findAll();
            }

            // Si solo hay precio_max, usar búsqueda específica
            if (filters.precio_max && Object.keys(filters).length === 1) {
                return await this.model.findByMaxPrice(filters.precio_max);
            }

            // Si solo hay ubicacion, usar búsqueda específica  
            if (filters.ubicacion && Object.keys(filters).length === 1) {
                return await this.model.findByLocation(filters.ubicacion);
            }

            // Si solo hay tipo, usar búsqueda específica
            if (filters.tipo_propiedad && Object.keys(filters).length === 1) {
                return await this.model.findByType(filters.tipo_propiedad);
            }

            // Para filtros múltiples, usar búsqueda personalizada
            return await this.model.findByMultipleFilters(filters);

        } catch (error) {
            console.error('❌ Error en searchProperties:', error.message);
            return [];
        }
    }

    // Limpiar cache
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Cache de propiedades limpiado');
    }

    // Alias methods for compatibility with routes
    async getPropertyById(propertyId) {
        return await this.getById(propertyId);
    }

    async createProperty(propertyData) {
        return await this.create(propertyData);
    }

    async deleteProperty(propertyId) {
        const result = await this.delete(propertyId);
        return result;
    }
}

module.exports = PropertyService;