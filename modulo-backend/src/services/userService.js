const axios = require('axios');
const Joi = require('joi');

class UserService {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Esquema de validación para usuarios
        this.userSchema = Joi.object({
            cargo_id: Joi.number().valid(1, 2).required(), // 1=Agente, 2=Gerente
            nombre: Joi.string().max(30).required(),
            apellido: Joi.string().max(30).required(),
            telefono: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
            estado: Joi.number().valid(0, 1).default(1)
        });
    }

    // Crear nuevo usuario
    async create(userData) {
        console.log('👨‍💼 Creando nuevo usuario');

        try {
            // Validar datos
            const { error, value } = this.userSchema.validate(userData);
            if (error) {
                throw new Error(`Validación fallida: ${error.details[0].message}`);
            }

            // Verificar que no exista el teléfono
            const existing = await this.getByPhone(value.telefono);
            if (existing) {
                throw new Error('Ya existe un usuario con ese número de teléfono');
            }

            // Enviar a base de datos
            const response = await axios.post(
                `${this.databaseUrl}/api/users`,
                value,
                { timeout: 10000 }
            );

            if (response.data.success) {
                console.log('✅ Usuario creado');
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error creando usuario');
            }

        } catch (error) {
            console.error('❌ Error creando usuario:', error.message);
            throw error;
        }
    }

    // Actualizar usuario
    async update(userId, updates) {
        console.log('🔄 Actualizando usuario:', userId);

        try {
            // Validar actualizaciones
            const updateSchema = this.userSchema.fork(
                Object.keys(this.userSchema.describe().keys),
                (schema) => schema.optional()
            );

            const { error, value } = updateSchema.validate(updates);
            if (error) {
                throw new Error(`Validación fallida: ${error.details[0].message}`);
            }

            // Enviar actualización
            const response = await axios.put(
                `${this.databaseUrl}/api/users/${userId}`,
                value,
                { timeout: 10000 }
            );

            if (response.data.success) {
                console.log('✅ Usuario actualizado');
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error actualizando usuario');
            }

        } catch (error) {
            console.error('❌ Error actualizando usuario:', error.message);
            throw error;
        }
    }

    // Desactivar usuario
    async deactivate(userId) {
        console.log('🚫 Desactivando usuario:', userId);

        try {
            return await this.update(userId, { estado: 0 });

        } catch (error) {
            console.error('❌ Error desactivando usuario:', error.message);
            throw error;
        }
    }

    // Obtener usuario por ID
    async getById(userId) {
        console.log('🔍 Buscando usuario:', userId);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/users/${userId}`,
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
            console.error('❌ Error obteniendo usuario:', error.message);
            throw error;
        }
    }

    // Obtener usuario por teléfono
    async getByPhone(phone) {
        console.log('📱 Buscando usuario por teléfono:', phone);

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/users/validate/${phone}`,
                { timeout: 10000 }
            );

            if (response.data.valid) {
                return response.data.data;
            } else {
                return null;
            }

        } catch (error) {
            console.error('❌ Error buscando usuario:', error.message);
            return null;
        }
    }

    // Listar usuarios
    async list(filters = {}) {
        console.log('📋 Listando usuarios');

        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/users`,
                {
                    params: filters,
                    timeout: 10000
                }
            );

            if (response.data.success) {
                let users = response.data.data;
                
                // Filtrar por cargo si se especifica
                if (filters.cargo) {
                    const cargoFilter = filters.cargo.toLowerCase();
                    users = users.filter(u => 
                        u.cargo_nombre?.toLowerCase() === cargoFilter
                    );
                }
                
                return users;
            } else {
                return [];
            }

        } catch (error) {
            console.error('❌ Error listando usuarios:', error.message);
            return [];
        }
    }

    // Obtener rendimiento del usuario
    async getPerformance(userId) {
        console.log('📊 Obteniendo rendimiento del usuario:', userId);

        try {
            // Simulación de métricas de rendimiento
            // En producción esto vendría de análisis real de datos
            return {
                userId,
                period: 'month',
                metrics: {
                    properties_listed: Math.floor(Math.random() * 20),
                    properties_sold: Math.floor(Math.random() * 5),
                    clients_attended: Math.floor(Math.random() * 30),
                    visits_scheduled: Math.floor(Math.random() * 15),
                    response_time_avg: Math.floor(Math.random() * 60) + 5,
                    satisfaction_score: (Math.random() * 2 + 3).toFixed(1)
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo rendimiento:', error.message);
            return null;
        }
    }

    // Obtener estadísticas diarias
    async getDailyStats(date) {
        console.log('📊 Obteniendo estadísticas diarias de usuarios:', date);

        try {
            const agents = await this.list({ cargo: 'agente' });
            
            // Simulación de actividad por agente
            const agentActivity = agents.map(agent => ({
                id: agent.id,
                nombre: `${agent.nombre} ${agent.apellido}`,
                actividad: Math.floor(Math.random() * 20),
                mensajes: Math.floor(Math.random() * 30),
                visitas: Math.floor(Math.random() * 5)
            }));

            return {
                totalAgents: agents.length,
                activeAgents: agents.filter(a => a.estado === 1).length,
                agents: agentActivity
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }

    // Obtener estadísticas mensuales
    async getMonthlyStats(month, year) {
        console.log(`📊 Obteniendo estadísticas mensuales de usuarios: ${month}/${year}`);

        try {
            const agents = await this.list({ cargo: 'agente' });
            
            // Simular mejor agente del mes
            const topAgent = agents.length > 0 ? {
                id: agents[0].id,
                nombre: `${agents[0].nombre} ${agents[0].apellido}`,
                ventas: Math.floor(Math.random() * 10) + 1
            } : null;

            return {
                totalAgents: agents.length,
                activeAgents: agents.filter(a => a.estado === 1).length,
                topAgent,
                avgPerformance: (Math.random() * 30 + 60).toFixed(1)
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas mensuales:', error.message);
            return {};
        }
    }

    // Obtener estadísticas generales
    async getStats() {
        try {
            const users = await this.list();
            
            return {
                total: users.length,
                agents: users.filter(u => u.cargo_id === 1).length,
                managers: users.filter(u => u.cargo_id === 2).length,
                active: users.filter(u => u.estado === 1).length,
                inactive: users.filter(u => u.estado === 0).length
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {};
        }
    }
}

module.exports = UserService;