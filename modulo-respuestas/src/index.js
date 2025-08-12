// servidor/modulo-respuestas/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ResponseService = require('./services/responseService');
const FileService = require('./services/fileService');
const TemplateService = require('./services/templateService');
const WhatsAppConnector = require('./services/whatsAppConnector');

const app = express();
const PORT = process.env.RESPONSES_PORT || 3005;

// Configuración de multer para archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads', req.body.type || 'general');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 16777216 // 16MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
            'image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
        }
    }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log de requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Inicializar servicios
const fileService = new FileService();
const templateService = new TemplateService();
const whatsAppConnector = new WhatsAppConnector();
const responseService = new ResponseService(whatsAppConnector, fileService, templateService);

// Hacer servicios disponibles
app.locals.services = {
    responseService,
    fileService,
    templateService,
    whatsAppConnector
};

// ==================== RUTAS PRINCIPALES ====================

// Enviar respuesta
app.post('/api/send', async (req, res) => {
    try {
        console.log('📤 Enviando respuesta:', {
            to: req.body.to,
            type: req.body.responseType || 'text',
            hasFiles: !!req.body.files
        });

        const result = await responseService.sendResponse(req.body);

        res.json({
            success: true,
            data: result,
            message: 'Respuesta enviada correctamente'
        });

    } catch (error) {
        console.error('❌ Error enviando respuesta:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar respuesta a cliente (vía WhatsApp-Web)
app.post('/api/send/client', async (req, res) => {
    try {
        console.log('👤 Enviando respuesta a cliente');

        const result = await responseService.sendToClient(req.body);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error enviando a cliente:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar respuesta a agente/gerente (vía API oficial)
app.post('/api/send/system', async (req, res) => {
    try {
        console.log('🏢 Enviando respuesta del sistema');

        const result = await responseService.sendSystemResponse(req.body);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error enviando respuesta del sistema:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Subir archivo
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se proporcionó archivo'
            });
        }

        const fileData = await fileService.processUploadedFile(req.file);

        res.json({
            success: true,
            data: fileData,
            message: 'Archivo subido correctamente'
        });

    } catch (error) {
        console.error('❌ Error subiendo archivo:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener archivo
app.get('/api/files/:fileId', async (req, res) => {
    try {
        const file = await fileService.getFile(req.params.fileId);

        if (file) {
            res.sendFile(file.path);
        } else {
            res.status(404).json({
                success: false,
                error: 'Archivo no encontrado'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE PLANTILLAS ====================

// Obtener todas las plantillas
app.get('/api/templates', async (req, res) => {
    try {
        const templates = await templateService.getAllTemplates();

        res.json({
            success: true,
            data: templates
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener plantilla específica
app.get('/api/templates/:templateId', async (req, res) => {
    try {
        const template = await templateService.getTemplate(req.params.templateId);

        if (template) {
            res.json({
                success: true,
                data: template
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Renderizar plantilla con datos
app.post('/api/templates/render', async (req, res) => {
    try {
        const { templateId, data } = req.body;

        if (!templateId) {
            return res.status(400).json({
                success: false,
                error: 'ID de plantilla requerido'
            });
        }

        const rendered = await templateService.renderTemplate(templateId, data);

        res.json({
            success: true,
            data: rendered
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE BROADCAST ====================

// Enviar mensaje masivo
app.post('/api/broadcast', async (req, res) => {
    try {
        const { recipients, message, templateId, mediaFiles } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Lista de destinatarios requerida'
            });
        }

        console.log(`📢 Iniciando broadcast a ${recipients.length} destinatarios`);

        const result = await responseService.sendBroadcast({
            recipients,
            message,
            templateId,
            mediaFiles
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error en broadcast:', error.message);
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
        const health = await responseService.checkHealth();

        res.json({
            success: true,
            service: 'responses-module',
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
        const stats = await responseService.getStats();

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

// Cola de mensajes pendientes
app.get('/api/queue', async (req, res) => {
    try {
        const queue = await responseService.getQueueStatus();

        res.json({
            success: true,
            data: queue
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reintentar mensaje fallido
app.post('/api/retry/:messageId', async (req, res) => {
    try {
        const result = await responseService.retryFailedMessage(req.params.messageId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        res.status(500).json({
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

async function startResponseModule() {
    try {
        console.log('📤 Inicializando Módulo de Respuestas...');

        // Crear directorios necesarios
        const dirs = ['uploads', 'uploads/images', 'uploads/documents', 'uploads/videos'];
        for (const dir of dirs) {
            const fullPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`📁 Directorio creado: ${dir}`);
            }
        }

        // Cargar plantillas predeterminadas
        await templateService.loadDefaultTemplates();

        // Verificar conectividad
        const health = await responseService.checkHealth();
        console.log('🔗 Conectividad:', {
            whatsapp: health.whatsapp ? '✅' : '❌',
            gateway: health.gateway ? '✅' : '❌',
            database: health.database ? '✅' : '❌'
        });

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ Módulo de Respuestas ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints disponibles:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - POST http://localhost:${PORT}/api/send`);
            console.log(`   - POST http://localhost:${PORT}/api/send/client`);
            console.log(`   - POST http://localhost:${PORT}/api/send/system`);
            console.log(`   - POST http://localhost:${PORT}/api/broadcast`);
            console.log(`   - GET  http://localhost:${PORT}/api/templates`);
            console.log(`   - GET  http://localhost:${PORT}/api/stats`);
        });

        // Procesar cola de mensajes cada 30 segundos
        setInterval(() => {
            responseService.processQueue().catch(console.error);
        }, 30000);

        // Limpiar archivos temporales cada hora
        setInterval(() => {
            fileService.cleanupOldFiles().catch(console.error);
        }, 3600000);

    } catch (error) {
        console.error('❌ Error inicializando Módulo de Respuestas:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Módulo de Respuestas...');
    await responseService.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Módulo de Respuestas...');
    await responseService.shutdown();
    process.exit(0);
});

// Iniciar el módulo
startResponseModule();