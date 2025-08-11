// servidor/gateway/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const ModuleConnector = require('./services/moduleConnector');
const MessageDispatcher = require('./services/messageDispatcher');
const HealthMonitor = require('./services/healthMonitor');

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log de requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - From: ${req.ip}`);
    next();
});

// Inicializar servicios
const moduleConnector = new ModuleConnector();
const messageDispatcher = new MessageDispatcher(moduleConnector);
const healthMonitor = new HealthMonitor(moduleConnector);

// Variables globales para el estado del sistema
app.locals.moduleConnector = moduleConnector;
app.locals.messageDispatcher = messageDispatcher;
app.locals.healthMonitor = healthMonitor;

// ==================== RUTAS PRINCIPALES ====================

// Endpoint para mensajes entrantes de WhatsApp-Web
app.post('/api/whatsapp/message', async (req, res) => {
    try {
        console.log('📨 Mensaje recibido de WhatsApp-Web:', {
            from: req.body.from,
            to: req.body.to,
            body: req.body.body?.substring(0, 50) + '...'
        });

        const result = await messageDispatcher.processIncomingMessage(req.body);
        
        res.json({
            success: true,
            data: result,
            message: 'Mensaje procesado correctamente'
        });

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Error al procesar mensaje'
        });
    }
});

// Endpoint para webhooks de WhatsApp API
app.post('/api/whatsapp/webhook', async (req, res) => {
    try {
        console.log('🎯 Webhook recibido de WhatsApp API:', {
            type: req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type || 'unknown'
        });

        const result = await messageDispatcher.processWebhook(req.body);
        
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error procesando webhook:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verificación de webhook para WhatsApp API
app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Token de verificación inválido');
        res.sendStatus(403);
    }
});

// ==================== RUTAS PROXY A MÓDULOS ====================

// Proxy a base de datos
app.use('/api/database', async (req, res) => {
    try {
        const response = await moduleConnector.forwardRequest('database', req.path, req.method, req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy a módulo de procesamiento
app.use('/api/processing', async (req, res) => {
    try {
        const response = await moduleConnector.forwardRequest('processing', req.path, req.method, req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy a módulo de respuestas (cuando esté listo)
app.use('/api/responses', async (req, res) => {
    try {
        const response = await moduleConnector.forwardRequest('responses', req.path, req.method, req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy a módulo de backend (cuando esté listo)
app.use('/api/backend', async (req, res) => {
    try {
        const response = await moduleConnector.forwardRequest('backend', req.path, req.method, req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Estado del sistema
app.get('/api/system/status', async (req, res) => {
    try {
        const status = await healthMonitor.getSystemStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check del gateway
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'gateway',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Información de los módulos registrados
app.get('/api/modules', (req, res) => {
    const modules = moduleConnector.getModuleList();
    res.json({
        success: true,
        data: modules
    });
});

// ==================== MANEJO DE ERRORES ====================

// Middleware de manejo de errores
app.use((error, req, res, next) => {
    console.error('❌ Error no manejado:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method
    });
});

// ==================== INICIALIZACIÓN ====================

async function startGateway() {
    try {
        console.log('🚀 Inicializando Gateway...');

        // Registrar módulos existentes
        await moduleConnector.registerModule('database', `http://localhost:3006`);
        await moduleConnector.registerModule('whatsapp', `http://localhost:3001`);
        await moduleConnector.registerModule('processing', `http://localhost:3002`);
        
        // Los siguientes los registraremos cuando los creemos
        // await moduleConnector.registerModule('responses', `http://localhost:3005`);
        // await moduleConnector.registerModule('backend', `http://localhost:3004`);

        console.log('✅ Módulos registrados exitosamente');
        
        // Verificar salud de módulos registrados
        await healthMonitor.checkAllModules();

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ Gateway ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints disponibles:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - http://localhost:${PORT}/api/system/status`);
            console.log(`   - http://localhost:${PORT}/api/modules`);
            console.log(`   - http://localhost:${PORT}/api/whatsapp/message`);
            console.log(`   - http://localhost:${PORT}/api/whatsapp/webhook`);
        });

        // Monitor de salud cada 30 segundos
        setInterval(() => {
            healthMonitor.checkAllModules().catch(console.error);
        }, 30000);

    } catch (error) {
        console.error('❌ Error inicializando Gateway:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Gateway...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Gateway...');
    process.exit(0);
});

// Iniciar el gateway
startGateway();