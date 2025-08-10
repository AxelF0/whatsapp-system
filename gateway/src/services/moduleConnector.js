const axios = require('axios');

class ModuleConnector {
    constructor() {
        this.modules = new Map();
        this.timeout = 10000; // 10 segundos
    }

    // Registrar un módulo
    async registerModule(name, baseUrl) {
        console.log(`🔗 Registrando módulo: ${name} en ${baseUrl}`);
        
        this.modules.set(name, {
            name,
            baseUrl: baseUrl.replace(/\/$/, ''), // Quitar slash final
            status: 'unknown',
            lastCheck: null,
            responseTime: null
        });

        // Hacer un ping inicial
        await this.pingModule(name);
    }

    // Hacer ping a un módulo
    async pingModule(moduleName) {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`Módulo ${moduleName} no registrado`);
        }

        try {
            const startTime = Date.now();
            
            await axios.get(`${module.baseUrl}/api/health`, {
                timeout: this.timeout
            });

            const responseTime = Date.now() - startTime;
            
            // Actualizar estado
            module.status = 'healthy';
            module.lastCheck = new Date();
            module.responseTime = responseTime;

            console.log(`✅ ${moduleName}: healthy (${responseTime}ms)`);
            return true;

        } catch (error) {
            module.status = 'unhealthy';
            module.lastCheck = new Date();
            module.responseTime = null;

            console.log(`❌ ${moduleName}: unhealthy - ${error.message}`);
            return false;
        }
    }

    // Reenviar petición a un módulo
    async forwardRequest(moduleName, path, method = 'GET', data = null) {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`Módulo ${moduleName} no registrado`);
        }

        if (module.status === 'unhealthy') {
            throw new Error(`Módulo ${moduleName} no está disponible`);
        }

        try {
            const config = {
                method: method.toLowerCase(),
                url: `${module.baseUrl}${path}`,
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Forwarded-By': 'Gateway'
                }
            };

            if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
                config.data = data;
            } else if (data && method.toLowerCase() === 'get') {
                config.params = data;
            }

            const response = await axios(config);
            return response.data;

        } catch (error) {
            console.error(`❌ Error en ${moduleName}:`, error.message);
            
            if (error.response) {
                // Error HTTP del módulo
                throw new Error(`${moduleName}: ${error.response.status} - ${error.response.data?.message || error.message}`);
            } else if (error.code === 'ECONNREFUSED') {
                // Módulo no disponible
                module.status = 'unhealthy';
                throw new Error(`${moduleName} no está disponible`);
            } else {
                throw new Error(`Error comunicándose con ${moduleName}: ${error.message}`);
            }
        }
    }

    // Obtener lista de módulos
    getModuleList() {
        const result = {};
        for (const [name, module] of this.modules) {
            result[name] = {
                name: module.name,
                baseUrl: module.baseUrl,
                status: module.status,
                lastCheck: module.lastCheck,
                responseTime: module.responseTime
            };
        }
        return result;
    }

    // Obtener módulo por nombre
    getModule(moduleName) {
        return this.modules.get(moduleName);
    }
}
module.exports = ModuleConnector;