// servidor/modulo-procesamiento/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const MessageAnalyzer = require('./services/messageAnalyzer');
const UserValidator = require('./services/userValidator');
const SystemRouter = require('./services/systemRouter');

const app = express();
const PORT = process.env.PROCESSING_PORT || 3002;

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
const userValidator = new UserValidator();
const messageAnalyzer = new MessageAnalyzer(userValidator);
const systemRouter = new SystemRouter();

// Hacer servicios disponibles
app.locals.services = {
    messageAnalyzer,
    userValidator,
    systemRouter
};

// ==================== RUTAS PRINCIPALES ====================

// Procesar mensaje entrante
app.post('/api/process/message', async (req, res) => {
    try {
        console.log('📥 Procesando mensaje entrante:', {
            from: req.body.from,
            to: req.body.to,
            source: req.body.source
        });

        // 1. Analizar de dónde viene el mensaje
        const analysis = await messageAnalyzer.analyzeMessage(req.body);
        
        console.log('🔍 Análisis del mensaje:', analysis.type);

        let result;

        // 2. Rutear según el tipo de mensaje
        if (analysis.type === 'client_query') {
            // Es una consulta de cliente → Ir directamente al módulo IA (no implementado aquí)
            result = {
                action: 'redirect_to_ia',
                reason: 'Consulta de cliente - debe ser manejada por módulo IA',
                processed: false
            };
        } else if (analysis.type === 'system_command') {
            // Es un comando de agente/gerente → Ir a Backend
            result = await systemRouter.routeToBackend(req.body, analysis);
        } else {
            // Mensaje no válido/no reconocido
            result = {
                action: 'ignore',
                reason: 'Usuario no registrado o mensaje no válido',
                processed: false
            };
        }

        res.json({
            success: true,
            data: {
                analysis,
                result,
                processed: result.processed || false
            }
        });

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Procesar respuesta de IA (cuando la IA responda) - PENDIENTE DE IMPLEMENTAR
app.post('/api/process/ai-response', async (req, res) => {
    try {
        console.log('🤖 Procesando respuesta de IA - PENDIENTE DE IMPLEMENTAR');

        res.json({
            success: false,
            message: 'Endpoint pendiente de implementar - el módulo IA debe manejar esto directamente'
        });

    } catch (error) {
        console.error('❌ Error procesando respuesta de IA:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Procesar respuesta de Backend (cuando el backend responda)
app.post('/api/process/backend-response', async (req, res) => {
    try {
        console.log('⚙️ Procesando respuesta de Backend');

        const result = await systemRouter.processBackendResponse(req.body);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error procesando respuesta de Backend:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'processing-module',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        capabilities: [
            'Análisis de mensajes entrantes',
            'Validación de usuarios registrados', 
            'Ruteo a IA para consultas de clientes',
            'Ruteo a Backend para comandos de sistema'
        ]
    });
});

// Estadísticas del procesamiento
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            // Aquí podrías agregar contadores de mensajes procesados
            messagesProcessed: 0,
            clientQueries: 0,
            systemCommands: 0,
            invalidMessages: 0
        }
    });
});

// ==================== MANEJO DE ERRORES ====================

app.use((error, req, res, next) => {
    console.error('❌ Error no manejado:', error.message);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

// ==================== INICIALIZACIÓN ====================

async function startProcessingModule() {
    try {
        console.log('🧠 Inicializando Módulo de Procesamiento...');

        // Verificar conectividad con otros módulos
        console.log('🔗 Verificando conectividad con base de datos...');
        await userValidator.testDatabaseConnection();

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ Módulo de Procesamiento ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints disponibles:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - POST http://localhost:${PORT}/api/process/message`);
            console.log(`   - POST http://localhost:${PORT}/api/process/ai-response`);
            console.log(`   - POST http://localhost:${PORT}/api/process/backend-response`);
        });

    } catch (error) {
        console.error('❌ Error inicializando Módulo de Procesamiento:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando Módulo de Procesamiento...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Cerrando Módulo de Procesamiento...');
    process.exit(0);
});

// Iniciar el módulo
startProcessingModule();