// servidor/modulo-backend/src/services/propertyService.js

const axios = require('axios');
const Joi = require('joi');

class PropertyService {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Esquema de validación para propiedades
        this.propertySchema = Joi.object({
            usuario_id: Joi.number().required(),
            nombre_propiedad: Joi.string().max(200).required(),
            descripcion: Joi.string().max(1000).allow(''),
            precio: Joi.number().min(10000).max(10000000).required(),
            ubicacion: Joi.string().max(255).required(),
            tamano: Joi.string().max(100).allow(''),
            tipo_propiedad: Joi.string().valid('casa', 'departamento', 'terreno', 'oficina', 'local').default('casa'),
            dormitorios: Joi.number().min(0).max(20).default(0),
            banos: Joi.number().min(0).max(10).default(0),
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

            // Enviar a base de datos
            const response = await axios.post(
                `${this.databaseUrl}/api/properties`,
                value,
                { timeout: 10000 }
            );

            if (response.data.success) {
                const property = response.data.data;
                
                // Limpiar cache
                this.clearCache();
                
                console.log('✅ Propiedad creada:', property.id);
                return property;
            } else {
                throw new Error(response.data.error || 'Error creando propiedad');
            }

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

            // Enviar actualización
            const response = await axios.put(
                `${this.databaseUrl}/api/properties/${propertyId}`,
                value,
                { timeout: 10000 }
            );

            if (response.data.success) {
                // Limpiar cache
                this.clearCache();
                
                console.log('✅ Propiedad actualizada');
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error actualizando propiedad');
            }

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
    
            // Marcar como eliminada (soft delete)
            const response = await axios.delete(
                `${this.databaseUrl}/api/properties/${id}`,
                { timeout: 10000 }
            );
    
            if (response.data.success) {
                // Limpiar cache
                this.clearCache();
                
                console.log('✅ Propiedad eliminada');
                return true;
            } else {
                throw new Error(response.data.error || 'Error eliminando propiedad');
            }
    
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
    
            // Buscar en base de datos
            const response = await axios.get(
                `${this.databaseUrl}/api/properties/${id}`,
                { timeout: 10000 }
            );
    
            if (response.data.success) {
                const property = response.data.data;
                
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
            if (error.response?.status === 404) {
                return null;
            }
            console.error('❌ Error obteniendo propiedad:', error.message);
            throw error;
        }
    }

    // Listar todas las propiedades
    async list(filters = {}) {
        console.log('📋 Listando propiedades');

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/properties`,
                {
                    params: filters,
                    timeout: 10000
                }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error listando propiedades');
            }

        } catch (error) {
            console.error('❌ Error listando propiedades:', error.message);
            throw error;
        }
    }

    // Buscar propiedades con filtros
    async search(filters) {
        console.log('🔍 Buscando propiedades con filtros:', filters);

        try {
            const response = await axios.post(
                `${this.databaseUrl}/api/properties/search`,
                filters,
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }

        } catch (error) {
            console.error('❌ Error buscando propiedades:', error.message);
            return [];
        }
    }

    // Obtener propiedades de un agente
    async getByAgent(agentId) {
        console.log('👤 Obteniendo propiedades del agente:', agentId);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/properties`,
                {
                    params: { usuario_id: agentId },
                    timeout: 10000
                }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }

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

    // Limpiar cache
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Cache de propiedades limpiado');
    }
}

module.exports = PropertyService;