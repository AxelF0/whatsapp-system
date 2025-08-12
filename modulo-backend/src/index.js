// servidor/modulo-backend/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Servicios
const PropertyService = require('./services/propertyService');
const ClientService = require('./services/clientService');
const UserService = require('./services/userService');
const CommandProcessor = require('./services/commandProcessor');

// Controladores
const PropertyController = require('./controllers/propertyController');
const ClientController = require('./controllers/clientController');
const UserController = require('./controllers/userController');

const app = express();
const PORT = process.env.BACKEND_PORT || 3004;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Inicializar servicios
const propertyService = new PropertyService();
const clientService = new ClientService();
const userService = new UserService();
const commandProcessor = new CommandProcessor(propertyService, clientService, userService);

// Inicializar controladores
const propertyController = new PropertyController(propertyService);
const clientController = new ClientController(clientService);
const userController = new UserController(userService);

// Hacer servicios disponibles
app.locals.services = {
    propertyService,
    clientService,
    userService,
    commandProcessor
};

// ==================== RUTA PRINCIPAL DE COMANDOS ====================

// Procesar comando de WhatsApp
app.post('/api/command', async (req, res) => {
    try {
        console.log('📥 Procesando comando:', {
            user: req.body.user?.name,
            command: req.body.command?.type
        });

        const result = await commandProcessor.processCommand(req.body);

        res.json({
            success: true,
            data: result,
            message: result.message || 'Comando ejecutado correctamente'
        });

    } catch (error) {
        console.error('❌ Error procesando comando:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
            suggestion: commandProcessor.getSuggestion(error.message)
        });
    }
});

// ==================== RUTAS CRUD DE PROPIEDADES ====================

// Listar propiedades
app.get('/api/properties', propertyController.list.bind(propertyController));

// Obtener propiedad por ID
app.get('/api/properties/:id', propertyController.getById.bind(propertyController));

// Crear propiedad
app.post('/api/properties', propertyController.create.bind(propertyController));

// Actualizar propiedad
app.put('/api/properties/:id', propertyController.update.bind(propertyController));

// Eliminar propiedad (soft delete)
app.delete('/api/properties/:id', propertyController.delete.bind(propertyController));

// Buscar propiedades
app.post('/api/properties/search', propertyController.search.bind(propertyController));

// Estadísticas de propiedades
app.get('/api/properties/stats/summary', propertyController.getStats.bind(propertyController));

// ==================== RUTAS CRUD DE CLIENTES ====================

// Listar clientes
app.get('/api/clients', clientController.list.bind(clientController));

// Obtener cliente por ID
app.get('/api/clients/:id', clientController.getById.bind(clientController));

// Crear/actualizar cliente
app.post('/api/clients', clientController.createOrUpdate.bind(clientController));

// Actualizar preferencias del cliente
app.put('/api/clients/:id/preferences', clientController.updatePreferences.bind(clientController));

// Obtener historial del cliente
app.get('/api/clients/:id/history', clientController.getHistory.bind(clientController));

// Asignar propiedad a cliente
app.post('/api/clients/:id/assign-property', clientController.assignProperty.bind(clientController));

// ==================== RUTAS CRUD DE USUARIOS ====================

// Listar usuarios (agentes/gerentes)
app.get('/api/users', userController.list.bind(userController));

// Obtener usuario por ID
app.get('/api/users/:id', userController.getById.bind(userController));

// Crear usuario
app.post('/api/users', userController.create.bind(userController));

// Actualizar usuario
app.put('/api/users/:id', userController.update.bind(userController));

// Desactivar usuario
app.delete('/api/users/:id', userController.deactivate.bind(userController));

// Obtener rendimiento del usuario
app.get('/api/users/:id/performance', userController.getPerformance.bind(userController));

// ==================== RUTAS DE REPORTES ====================

// Reporte diario
app.get('/api/reports/daily', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const report = await commandProcessor.generateDailyReport(date);

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reporte mensual
app.get('/api/reports/monthly', async (req, res) => {
    try {
        const month = req.query.month || new Date().getMonth() + 1;
        const year = req.query.year || new Date().getFullYear();

        const report = await commandProcessor.generateMonthlyReport(month, year);

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Top propiedades
app.get('/api/reports/top-properties', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const topProperties = await propertyService.getTopProperties(limit);

        res.json({
            success: true,
            data: topProperties
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const health = await commandProcessor.checkHealth();

        res.json({
            success: true,
            service: 'backend-module',
            status: health.allConnected ? 'healthy' : 'degraded',
            connections: health,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Estadísticas del módulo
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            properties: await propertyService.getStats(),
            clients: await clientService.getStats(),
            users: await userService.getStats(),
            commands: commandProcessor.getStats()
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Lista de comandos disponibles
app.get('/api/commands/help', (req, res) => {
    const commands = commandProcessor.getAvailableCommands();

    res.json({
        success: true,
        data: commands
    });
});

// Validar comando
app.post('/api/commands/validate', (req, res) => {
    try {
        const validation = commandProcessor.validateCommand(req.body);

        res.json({
            success: true,
            data: validation
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== MANEJO DE ERRORES ====================

app.use((error, req, res, next) => {
    console.error('❌ Error no manejado:', error.message);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

// ==================== INICIALIZACIÓN ====================

async function startBackendModule() {
    try {
        console.log('⚙️ Inicializando Módulo Backend...');

        // Verificar conectividad con otros módulos
        const health = await commandProcessor.checkHealth();
        console.log('🔗 Conectividad:', {
            database: health.database ? '✅' : '❌',
            responses: health.responses ? '✅' : '❌'
        });

        if (!health.database) {
            console.warn('⚠️ Base de datos no disponible. Algunas funciones estarán limitadas.');
        }

        // Cargar datos iniciales si es necesario
        await commandProcessor.initialize();

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ Módulo Backend ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints principales:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - POST http://localhost:${PORT}/api/command`);
            console.log(`   - GET  http://localhost:${PORT}/api/properties`);
            console.log(`   - GET  http://localhost:${PORT}/api/clients`);
            console.log(`   - GET  http://localhost:${PORT}/api/users`);
            console.log(`   - GET  http://localhost:${PORT}/api/reports/daily`);
            console.log(`   - GET  http://localhost:${PORT}/api/commands/help`);
        });

        // Actualizar estadísticas cada 5 minutos
        setInterval(() => {
            commandProcessor.updateStats().catch(console.error);
        }, 300000);

    } catch (error) {
        console.error('❌ Error inicializando Módulo Backend:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Módulo Backend...');
    await commandProcessor.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Módulo Backend...');
    await commandProcessor.shutdown();
    process.exit(0);
});

// Iniciar el módulo
startBackendModule();