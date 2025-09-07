// servidor/modulo-backend/src/services/propertyService.js

const axios = require('axios');
const Joi = require('joi');

class PropertyService {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Esquema de validación para propiedades (campos reales de la tabla)
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

            // Enviar a base de datos
            const response = await axios.post(
                `${this.databaseUrl}/api/properties`,
                value,
                { timeout: 10000 }
            );

            if (response.data.success) {
                const property = response.data.data;
                
                
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
    
            // Verificar que existe (buscar en cualquier estado para eliminar)
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

    // Obtener propiedad por ID (cualquier estado)
    async getByIdAnyStatus(propertyId) {
        console.log('🔍 Buscando propiedad (cualquier estado):', propertyId);

        try {
            // Convertir ID si es necesario
            let id = propertyId;
            
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

            // Buscar en base de datos sin filtrar por estado
            const response = await axios.get(
                `${this.databaseUrl}/api/properties/${id}/any-status`,
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                return null;
            }

        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            console.error('❌ Error obteniendo propiedad (cualquier estado):', error.message);
            throw error;
        }
    }

    // Listar todas las propiedades
    async list(filters = {}) {
        console.log('📋 Listando propiedades con filtros:', filters);
        
        if (filters.usuario_id) {
            console.log(`🔍 FILTRO ACTIVO: Buscando propiedades del usuario ID: ${filters.usuario_id}`);
        }

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

    // Buscar TODAS las propiedades (sin filtros)
    async searchAll() {
        console.log('🔍 Buscando TODAS las propiedades del sistema');

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/properties/all`,
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }

        } catch (error) {
            console.error('❌ Error buscando todas las propiedades:', error.message);
            return [];
        }
    }

    // Buscar propiedades por tipo
    async searchByType(type) {
        console.log('🔍 Buscando propiedades por tipo:', type);
        return await this.search({ tipo_propiedad: type });
    }

    // Buscar propiedades por precio
    async searchByPrice(minPrice, maxPrice) {
        console.log('🔍 Buscando propiedades por precio:', { minPrice, maxPrice });
        const filters = {};
        if (minPrice) filters.precio_min = minPrice;
        if (maxPrice) filters.precio_max = maxPrice;
        return await this.search(filters);
    }

    // Buscar propiedades por ubicación
    async searchByLocation(location) {
        console.log('🔍 Buscando propiedades por ubicación:', location);
        return await this.search({ ubicacion: location });
    }

    // Buscar propiedades personalizada
    async searchCustom(criteria) {
        console.log('🔍 Búsqueda personalizada:', criteria);
        return await this.search(criteria);
    }

    // Buscar propiedades por precio máximo
    async searchByMaxPrice(maxPrice) {
        console.log('🔍 Buscando propiedades por precio máximo:', maxPrice);
        return await this.search({ precio_max: maxPrice });
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

    // Buscar propiedades por tipo de operación
    async searchByOperationType(tipoOperacionId) {
        console.log('🔍 Buscando propiedades por tipo de operación:', tipoOperacionId);
        return await this.search({ tipo_operacion_id: tipoOperacionId });
    }

    // Buscar propiedades por tipo de propiedad  
    async searchByPropertyType(tipoPropiedad) {
        console.log('🔍 Buscando propiedades por tipo:', tipoPropiedad);
        return await this.search({ tipo_propiedad: tipoPropiedad });
    }

    // Buscar propiedades por estado de propiedad
    async searchByPropertyStatus(estadoPropiedad) {
        console.log('🔍 Buscando propiedades por estado:', estadoPropiedad);
        return await this.search({ estado_propiedad: estadoPropiedad });
    }

    // Cambiar estado de propiedad (toggle)
    async toggleStatus(propertyId) {
        console.log('🔄 Cambiando estado de propiedad:', propertyId);

        try {
            // Convertir ID si es necesario
            let id = propertyId;
            if (typeof propertyId === 'string' && propertyId.startsWith('PROP')) {
                id = parseInt(propertyId.replace('PROP', ''));
                if (isNaN(id)) {
                    throw new Error(`ID de propiedad inválido: ${propertyId}`);
                }
            } else if (typeof propertyId === 'string') {
                id = parseInt(propertyId);
                if (isNaN(id)) {
                    throw new Error(`ID de propiedad inválido: ${propertyId}`);
                }
            }

            // Cambiar estado usando el endpoint de la base de datos
            const response = await axios.put(
                `${this.databaseUrl}/api/properties/${id}/toggle-status`,
                {},
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error cambiando estado de propiedad');
            }

        } catch (error) {
            console.error('❌ Error cambiando estado de propiedad:', error.message);
            throw error;
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
}

module.exports = PropertyService;