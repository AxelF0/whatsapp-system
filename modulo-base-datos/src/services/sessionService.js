// modulo-base-datos/src/services/sessionService.js

const UserSession = require('../models/mongodb/userSession');
const UserModel = require('../models/postgresql/userModel');

class SessionService {
    constructor(userModel) {
        this.userModel = userModel;
    }

    // Validar usuario y crear/actualizar sesión
    async validateAndCreateSession(phoneNumber) {
        console.log('🔍 Validando y creando sesión para:', phoneNumber);

        try {
            // 1. Buscar sesión activa existente
            const existingSession = await UserSession.findOne({
                phoneNumber,
                isActive: true,
                expiresAt: { $gt: new Date() }
            });

            if (existingSession) {
                // Extender sesión existente
                await existingSession.extend();
                console.log('✅ Sesión existente extendida:', existingSession.user.nombre);
                return {
                    valid: true,
                    fromCache: true,
                    user: existingSession.user,
                    session: existingSession
                };
            }

            // 2. Validar usuario contra PostgreSQL
            const user = await this.userModel.findByPhone(phoneNumber);
            if (!user) {
                console.log('❌ Usuario no válido:', phoneNumber);
                return { valid: false };
            }

            // 3. Crear nueva sesión en MongoDB
            const newSession = new UserSession({
                phoneNumber,
                user: {
                    id: user.id,
                    nombre: user.nombre,
                    apellido: user.apellido,
                    cargo_id: user.cargo_id,
                    cargo_nombre: user.cargo_nombre
                },
                sessionType: 'agent-to-system'
            });

            await newSession.save();
            console.log('✅ Nueva sesión creada para:', user.nombre);

            return {
                valid: true,
                fromCache: false,
                user: newSession.user,
                session: newSession
            };

        } catch (error) {
            console.error('❌ Error en validación de sesión:', error.message);
            return { valid: false, error: error.message };
        }
    }

    // Obtener sesión activa
    async getActiveSession(phoneNumber) {
        try {
            const session = await UserSession.findOne({
                phoneNumber,
                isActive: true,
                expiresAt: { $gt: new Date() }
            });

            if (session) {
                // Actualizar última actividad
                await session.extend();
                return session;
            }

            return null;
        } catch (error) {
            console.error('❌ Error obteniendo sesión:', error.message);
            return null;
        }
    }

    // Cerrar sesión
    async closeSession(phoneNumber) {
        try {
            await UserSession.updateOne(
                { phoneNumber, isActive: true },
                { 
                    isActive: false,
                    lastActivity: new Date()
                }
            );

            console.log('🔐 Sesión cerrada para:', phoneNumber);
            return true;
        } catch (error) {
            console.error('❌ Error cerrando sesión:', error.message);
            return false;
        }
    }

    // Actualizar estado de menú
    async updateMenuState(phoneNumber, menuState) {
        try {
            await UserSession.updateOne(
                { phoneNumber, isActive: true },
                { 
                    menuState,
                    lastActivity: new Date()
                }
            );

            return true;
        } catch (error) {
            console.error('❌ Error actualizando estado de menú:', error.message);
            return false;
        }
    }

    // Limpiar sesiones expiradas (tarea de mantenimiento)
    async cleanExpiredSessions() {
        try {
            const result = await UserSession.deleteMany({
                $or: [
                    { expiresAt: { $lt: new Date() } },
                    { isActive: false, updatedAt: { $lt: new Date(Date.now() - 24*60*60*1000) } }
                ]
            });

            console.log(`🧹 ${result.deletedCount} sesiones expiradas eliminadas`);
            return result.deletedCount;
        } catch (error) {
            console.error('❌ Error limpiando sesiones:', error.message);
            return 0;
        }
    }

    // Obtener estadísticas de sesiones
    async getSessionStats() {
        try {
            const stats = await UserSession.aggregate([
                {
                    $group: {
                        _id: '$isActive',
                        count: { $sum: 1 },
                        avgActivity: { $avg: '$activityCount' }
                    }
                }
            ]);

            return {
                active: stats.find(s => s._id === true)?.count || 0,
                inactive: stats.find(s => s._id === false)?.count || 0,
                total: stats.reduce((sum, s) => sum + s.count, 0)
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return { active: 0, inactive: 0, total: 0 };
        }
    }
}

module.exports = SessionService;