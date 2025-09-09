const axios = require('axios');
const Joi = require('joi');

class ClientService {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Esquema de validación para clientes
        this.clientSchema = Joi.object({
            id: Joi.number().integer().positive().optional(),
            nombre: Joi.string().max(30).allow(''),
            apellido: Joi.string().max(30).allow(''),
            telefono: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
            email: Joi.string().email().allow('', null),
            preferencias: Joi.string().max(500).allow(''),
            estado: Joi.number().valid(0, 1).default(1),
            agente_id: Joi.number().integer().positive().allow(null).optional()
        });
    }

    // Crear o actualizar cliente
    async createOrUpdate(clientData) {
        console.log('👤 Creando/actualizando cliente');

        try {
            // Validar datos
            const { error, value } = this.clientSchema.validate(clientData);
            if (error) {
                throw new Error(`Validación fallida: ${error.details[0].message}`);
            }

            // Si tiene ID, usar actualización por ID
            if (value.id) {
                const response = await axios.put(
                    `${this.databaseUrl}/api/clients/${value.id}`,
                    value,
                    { timeout: 10000 }
                );

                if (response.data.success) {
                    console.log('✅ Cliente actualizado por ID');
                    return response.data.data;
                } else {
                    throw new Error(response.data.error || 'Error actualizando cliente');
                }
            } else {
                // Crear o actualizar por teléfono (método legacy)
                const response = await axios.post(
                    `${this.databaseUrl}/api/clients`,
                    value,
                    { timeout: 10000 }
                );

                if (response.data.success) {
                    console.log('✅ Cliente procesado');
                    return response.data.data;
                } else {
                    throw new Error(response.data.error || 'Error procesando cliente');
                }
            }

        } catch (error) {
            console.error('❌ Error procesando cliente:', error.message);
            throw error;
        }
    }

    // Obtener cliente por ID
    async getById(clientId) {
        console.log('🔍 Buscando cliente:', clientId);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/clients/${clientId}`,
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
            console.error('❌ Error obteniendo cliente:', error.message);
            throw error;
        }
    }

    // Obtener cliente por teléfono
    async getByPhone(phone) {
        console.log('📱 Buscando cliente por teléfono:', phone);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/clients/phone/${phone}`,
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
            console.error('❌ Error buscando cliente:', error.message);
            throw error;
        }
    }

    // Obtener cliente por ID o teléfono
    async getByIdOrPhone(identifier) {
        console.log('🔍 Buscando cliente por ID o teléfono:', identifier);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/clients/find/${identifier}`,
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
            console.error('❌ Error buscando cliente:', error.message);
            throw error;
        }
    }

    // Listar clientes activos solo del agente
    async list(filters = {}) {
        console.log('📋 Listando clientes');
        try {
            let agente_id = filters.agente_id || null;
            const response = await axios.get(
                `${this.databaseUrl}/api/clients`,
                {
                    params: { ...(agente_id ? { agente_id } : {}) },
                    timeout: 10000
                }
            );
            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }
        } catch (error) {
            console.error('❌ Error listando clientes:', error.message);
            return [];
        }
    }

    // Listar clientes inactivos solo del agente
    async listInactive(filters = {}) {
        console.log('📋 Listando clientes inactivos');
        try {
            let agente_id = filters.agente_id || null;
            const response = await axios.get(
                `${this.databaseUrl}/api/clients/inactive`,
                {
                    params: { ...(agente_id ? { agente_id } : {}) },
                    timeout: 10000
                }
            );
            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }
        } catch (error) {
            console.error('❌ Error listando clientes inactivos:', error.message);
            return [];
        }
    }

    // Actualizar preferencias del cliente
    async updatePreferences(clientId, preferences) {
        console.log('🔄 Actualizando preferencias del cliente:', clientId);

        try {
            const response = await axios.put(
                `${this.databaseUrl}/api/clients/${clientId}/preferences`,
                { preferencias: preferences },
                { timeout: 10000 }
            );

            if (response.data.success) {
                console.log('✅ Preferencias actualizadas');
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error actualizando preferencias');
            }

        } catch (error) {
            console.error('❌ Error actualizando preferencias:', error.message);
            throw error;
        }
    }

    // Asignar propiedad a cliente
    async assignProperty(clientId, propertyId) {
        console.log(`🏠 Asignando propiedad ${propertyId} al cliente ${clientId}`);

        try {
            // Aquí se crearía la relación cliente-propiedad
            // Por ahora simulamos la respuesta
            return {
                success: true,
                clientId,
                propertyId,
                assignedAt: new Date()
            };

        } catch (error) {
            console.error('❌ Error asignando propiedad:', error.message);
            throw error;
        }
    }

    // Obtener estadísticas diarias
    async getDailyStats(date) {
        console.log('📊 Obteniendo estadísticas diarias de clientes:', date);

        try {
            // Simulación de estadísticas
            return {
                new: Math.floor(Math.random() * 10),
                active: Math.floor(Math.random() * 20),
                contacted: Math.floor(Math.random() * 15)
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }

    // Obtener estadísticas mensuales
    async getMonthlyStats(month, year) {
        console.log(`📊 Obteniendo estadísticas mensuales de clientes: ${month}/${year}`);

        try {
            // Simulación de estadísticas
            return {
                total: Math.floor(Math.random() * 100) + 20,
                new: Math.floor(Math.random() * 50) + 10,
                converted: Math.floor(Math.random() * 20),
                satisfaction: (Math.random() * 2 + 3).toFixed(1)
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas mensuales:', error.message);
            return {};
        }
    }

    // Buscar cliente por ID o teléfono (cualquier estado)
    async findClientByIdOrPhone(identifier, agente_id = null) {
        console.log('🔍 Buscando cliente por ID o teléfono:', identifier, 'para agente:', agente_id);

        try {
            let url = `${this.databaseUrl}/api/clients/find/${encodeURIComponent(identifier)}`;
            if (agente_id) {
                url += `?agente_id=${agente_id}`;
            }
            
            const response = await axios.get(url, { timeout: 10000 });

            if (response.data.success) {
                return response.data.data;
            } else {
                return null;
            }

        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            console.error('❌ Error buscando cliente:', error.message);
            throw error;
        }
    }

    // Listar clientes inactivos
    async listInactive() {
        console.log('📋 Listando clientes eliminados');

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/clients/inactive`,
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                return [];
            }

        } catch (error) {
            console.error('❌ Error listando clientes eliminados:', error.message);
            return [];
        }
    }

    // Actualizar estado de cliente
    async updateClientStatus(clientId, status) {
        console.log('🔄 Actualizando estado de cliente:', clientId, 'a:', status);

        try {
            const response = await axios.put(
                `${this.databaseUrl}/api/clients/${clientId}/status`,
                { estado: status },
                { timeout: 10000 }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error actualizando estado');
            }

        } catch (error) {
            console.error('❌ Error actualizando estado:', error.message);
            throw error;
        }
    }

    // Obtener estadísticas generales
    async getStats() {
        try {
            const clients = await this.list();
            
            return {
                total: clients.length,
                active: clients.filter(c => c.estado === 1).length,
                inactive: clients.filter(c => c.estado === 0).length,
                withEmail: clients.filter(c => c.email).length,
                withPreferences: clients.filter(c => c.preferencias).length
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }
}

module.exports = ClientService;