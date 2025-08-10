class HealthMonitor {
    constructor(moduleConnector) {
        this.moduleConnector = moduleConnector;
        this.alertThreshold = 3; // Número de fallas consecutivas antes de alerta
        this.moduleFailures = new Map();
    }

    // Verificar salud de todos los módulos
    async checkAllModules() {
        const modules = this.moduleConnector.getModuleList();
        const results = {};

        for (const moduleName of Object.keys(modules)) {
            try {
                const isHealthy = await this.moduleConnector.pingModule(moduleName);
                results[moduleName] = isHealthy ? 'healthy' : 'unhealthy';

                // Resetear contador de fallas si está saludable
                if (isHealthy) {
                    this.moduleFailures.delete(moduleName);
                } else {
                    this.incrementFailures(moduleName);
                }

            } catch (error) {
                results[moduleName] = 'error';
                this.incrementFailures(moduleName);
            }
        }

        return results;
    }

    // Incrementar contador de fallas
    incrementFailures(moduleName) {
        const currentFailures = this.moduleFailures.get(moduleName) || 0;
        const newFailures = currentFailures + 1;
        
        this.moduleFailures.set(moduleName, newFailures);

        if (newFailures >= this.alertThreshold) {
            console.error(`🚨 ALERTA: Módulo ${moduleName} ha fallado ${newFailures} veces consecutivas`);
        }
    }

    // Obtener estado completo del sistema
    async getSystemStatus() {
        const moduleHealth = await this.checkAllModules();
        const modules = this.moduleConnector.getModuleList();
        
        const totalModules = Object.keys(modules).length;
        const healthyModules = Object.values(moduleHealth).filter(status => status === 'healthy').length;
        const unhealthyModules = totalModules - healthyModules;

        return {
            systemStatus: unhealthyModules === 0 ? 'healthy' : 'degraded',
            totalModules,
            healthyModules,
            unhealthyModules,
            modules: Object.keys(modules).map(name => ({
                name,
                ...modules[name],
                currentStatus: moduleHealth[name],
                consecutiveFailures: this.moduleFailures.get(name) || 0
            })),
            timestamp: new Date().toISOString(),
            gatewayUptime: process.uptime()
        };
    }
}
module.exports = HealthMonitor;