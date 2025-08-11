// servidor/modulo-whatsapp/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const WhatsAppManager = require('./services/whatsAppManager');
const SessionManager = require('./services/sessionManager');
const MessageHandler = require('./services/messageHandler');

const app = express();
const PORT = process.env.WHATSAPP_PORT || 3001;

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
const sessionManager = new SessionManager();
const messageHandler = new MessageHandler();
const whatsappManager = new WhatsAppManager(sessionManager, messageHandler);

// Variables globales
app.locals.whatsappManager = whatsappManager;
app.locals.sessionManager = sessionManager;

// ==================== RUTAS PRINCIPALES ====================

// Crear nueva sesión para agente
app.post('/api/sessions/create', async (req, res) => {
    try {
        const { agentPhone, agentName } = req.body;

        if (!agentPhone || !agentName) {
            return res.status(400).json({
                success: false,
                error: 'Teléfono y nombre del agente son requeridos'
            });
        }

        console.log(`📱 Creando sesión para agente: ${agentName} (${agentPhone})`);

        const result = await whatsappManager.createAgentSession(agentPhone, agentName);

        res.json({
            success: true,
            data: result,
            message: 'Sesión creada. Escanea el código QR para conectar.'
        });

    } catch (error) {
        console.error('❌ Error creando sesión:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener QR de una sesión
app.get('/api/sessions/:agentPhone/qr', async (req, res) => {
    try {
        const { agentPhone } = req.params;
        const qr = sessionManager.getSessionQR(agentPhone);

        if (qr) {
            res.json({
                success: true,
                data: { qr },
                message: 'Código QR disponible'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'QR no disponible para esta sesión'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Estado de todas las sesiones
app.get('/api/sessions/status', (req, res) => {
    try {
        const sessions = sessionManager.getAllSessionsStatus();

        res.json({
            success: true,
            data: {
                totalSessions: sessions.length,
                activeSessions: sessions.filter(s => s.status === 'ready').length,
                sessions: sessions
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar mensaje desde una sesión específica
app.post('/api/sessions/:agentPhone/send', async (req, res) => {
    try {
        const { agentPhone } = req.params;
        const { to, message, mediaUrl, mediaType } = req.body;

        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y mensaje son requeridos'
            });
        }

        const result = await whatsappManager.sendMessage(agentPhone, {
            to,
            message,
            mediaUrl,
            mediaType
        });

        res.json({
            success: true,
            data: result,
            message: 'Mensaje enviado correctamente'
        });

    } catch (error) {
        console.error('❌ Error enviando mensaje:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cerrar sesión de agente
app.delete('/api/sessions/:agentPhone', async (req, res) => {
    try {
        const { agentPhone } = req.params;

        await whatsappManager.closeAgentSession(agentPhone);

        res.json({
            success: true,
            message: 'Sesión cerrada correctamente'
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
app.get('/api/health', (req, res) => {
    const sessions = sessionManager.getAllSessionsStatus();
    const totalSessions = sessions.length;
    const readySessions = sessions.filter(s => s.status === 'ready').length;

    res.json({
        success: true,
        service: 'whatsapp-module',
        status: 'healthy',
        sessions: {
            total: totalSessions,
            ready: readySessions,
            pending: totalSessions - readySessions
        },
        timestamp: new Date().toISOString()
    });
});

// Información del módulo
app.get('/api/info', (req, res) => {
    res.json({
        success: true,
        data: {
            module: 'whatsapp',
            version: '1.0.0',
            capabilities: [
                'Múltiples sesiones de agentes',
                'Recepción automática de mensajes',
                'Envío de respuestas',
                'Gestión de archivos multimedia'
            ],
            supportedMessageTypes: ['text', 'image', 'video', 'audio', 'document']
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

async function startWhatsAppModule() {
    try {
        console.log('📱 Inicializando Módulo WhatsApp...');

        // Cargar sesiones existentes
        await whatsappManager.loadExistingSessions();

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ Módulo WhatsApp ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints disponibles:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - http://localhost:${PORT}/api/sessions/status`);
            console.log(`   - POST http://localhost:${PORT}/api/sessions/create`);
            console.log(`   - POST http://localhost:${PORT}/api/sessions/{phone}/send`);
        });

        // Monitor de sesiones cada 30 segundos
        setInterval(() => {
            sessionManager.checkSessionsHealth();
        }, 30000);

    } catch (error) {
        console.error('❌ Error inicializando módulo WhatsApp:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp...');
    await whatsappManager.closeAllSessions();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp...');
    await whatsappManager.closeAllSessions();
    process.exit(0);
});

// Iniciar el módulo
startWhatsAppModule();