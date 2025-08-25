// servidor/modulo-whatsapp/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Servicios de WhatsApp Web (para agentes)
const WhatsAppManager = require('./services/whatsAppManager');
const SessionManager = require('./services/sessionManager');
const MessageHandler = require('./services/messageHandler');

// Servicios de WhatsApp API (para sistema)
const WhatsAppApiService = require('./services/whatsAppApiService');
const WebhookHandler = require('./services/webhookHandler');

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

// Inicializar servicios de WhatsApp Web
const sessionManager = new SessionManager();
const messageHandler = new MessageHandler();
const whatsappManager = new WhatsAppManager(sessionManager, messageHandler);

// Inicializar servicios de WhatsApp API
const whatsAppApiService = new WhatsAppApiService();
const webhookHandler = new WebhookHandler(whatsAppApiService);

// Variables globales
app.locals.whatsappManager = whatsappManager;
app.locals.sessionManager = sessionManager;
app.locals.whatsAppApiService = whatsAppApiService;
app.locals.webhookHandler = webhookHandler;
app.locals.apiServiceUrl = `http://localhost:${process.env.WHATSAPP_API_PORT || 3007}`;

// ==================== RUTAS WHATSAPP WEB (AGENTES) ====================

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

        console.log(`📱 Creando sesión WhatsApp Web para agente: ${agentName} (${agentPhone})`);

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
                sessions: sessions,
                type: 'whatsapp-web' // Indicar que son sesiones de WhatsApp Web
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar mensaje desde una sesión específica de agente
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

        console.log(`📤 Enviando mensaje desde agente ${agentPhone} a cliente ${to}`);

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

// ==================== RUTAS API OFICIAL (SISTEMA) ====================

// Webhook de WhatsApp API
app.all('/api/whatsapp/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// Verificación de webhook (para Meta)
app.get('/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// Webhook para eventos (para Meta)
app.post('/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// Enviar mensaje del sistema
app.post('/api/system/send', async (req, res) => {
    try {
        const { to, message, replyToMessageId } = req.body;

        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y mensaje son requeridos'
            });
        }

        const result = await whatsAppApiService.sendTextMessage(to, message, replyToMessageId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error enviando mensaje del sistema:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar mensaje interactivo del sistema
app.post('/api/system/send/interactive', async (req, res) => {
    try {
        const { to, bodyText, buttons, headerText, footerText } = req.body;

        if (!to || !bodyText || !buttons) {
            return res.status(400).json({
                success: false,
                error: 'Faltan parámetros requeridos'
            });
        }

        const result = await whatsAppApiService.sendInteractiveMessage(
            to, bodyText, buttons, headerText, footerText
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error enviando mensaje interactivo:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Estado de la API oficial
app.get('/api/system/status', async (req, res) => {
    try {
        const apiResponse = await axios.get(
            `${app.locals.apiServiceUrl}/api/health`,
            { timeout: 5000 }
        );

        res.json({
            success: true,
            data: apiResponse.data
        });

    } catch (error) {
        res.status(503).json({
            success: false,
            error: 'API oficial no disponible',
            details: error.message
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Health check combinado
app.get('/api/health', async (req, res) => {
    const webSessions = sessionManager.getAllSessionsStatus();

    // Intentar obtener estado de la API oficial
    let apiStatus = { status: 'unknown' };
    try {
        const apiResponse = await axios.get(
            `${app.locals.apiServiceUrl}/api/health`,
            { timeout: 2000 }
        );
        apiStatus = apiResponse.data;
    } catch (error) {
        apiStatus = {
            status: 'offline',
            error: error.message
        };
    }

    res.json({
        success: true,
        service: 'whatsapp-module',
        status: 'healthy',
        components: {
            whatsappWeb: {
                status: 'active',
                sessions: {
                    total: webSessions.length,
                    ready: webSessions.filter(s => s.status === 'ready').length,
                    pending: webSessions.filter(s => s.status !== 'ready').length
                }
            },
            whatsappApi: apiStatus
        },
        timestamp: new Date().toISOString()
    });
});

// Información del módulo completo
app.get('/api/info', (req, res) => {
    res.json({
        success: true,
        data: {
            module: 'whatsapp-integrated',
            version: '2.0.0',
            components: {
                whatsappWeb: {
                    purpose: 'Manejo de sesiones de agentes',
                    capabilities: [
                        'Múltiples sesiones de agentes',
                        'Recepción automática de mensajes de clientes',
                        'Envío de respuestas a clientes',
                        'Gestión de archivos multimedia'
                    ]
                },
                whatsappApi: {
                    purpose: 'Comunicación del sistema con agentes/gerentes',
                    capabilities: [
                        'Recepción de comandos del sistema',
                        'Envío de respuestas oficiales',
                        'Mensajes interactivos',
                        'Plantillas de mensajes'
                    ]
                }
            },
            architecture: {
                clientToAgent: 'Cliente → Agente (WhatsApp Web) → Sistema → IA → Respuesta',
                agentToSystem: 'Agente/Gerente → Sistema (API Oficial) → Backend → Respuesta'
            }
        }
    });
});

// Estadísticas combinadas
app.get('/api/stats', async (req, res) => {
    const webStats = whatsappManager.getModuleStats();

    let apiStats = null;
    try {
        const apiResponse = await axios.get(
            `${app.locals.apiServiceUrl}/api/health`,
            { timeout: 2000 }
        );
        apiStats = apiResponse.data.stats;
    } catch (error) {
        apiStats = { error: 'API no disponible' };
    }

    res.json({
        success: true,
        data: {
            whatsappWeb: webStats,
            whatsappApi: apiStats,
            combined: {
                totalMessages: webStats.totalMessagesReceived + webStats.totalMessagesSent,
                timestamp: new Date().toISOString()
            }
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

async function startUnifiedWhatsApp() {
    try {
        console.log('Inicializando Módulo WhatsApp Unificado...');

        // Cargar sesiones WhatsApp-Web existentes
        await whatsappManager.loadExistingSessions();

        // Inicializar API oficial si está configurada
        try {
            if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
                await whatsAppApiService.initialize();
                console.log('API Oficial de WhatsApp inicializada');
            } else {
                console.log('API Oficial no configurada - funcionará en modo simulación');
            }
        } catch (error) {
            console.error('Error inicializando API oficial:', error.message);
            console.log('Continuando en modo simulación');
        }

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`Módulo WhatsApp Unificado ejecutándose en puerto ${PORT}`);
            console.log('Endpoints disponibles:');
            console.log(`  WhatsApp-Web: /api/sessions/*`);
            console.log(`  API Oficial: /api/system/* y /webhook`);
            console.log(`  Admin: /api/health, /api/stats`);
        });

        // Monitor de sesiones
        setInterval(() => {
            sessionManager.checkSessionsHealth();
        }, 30000);

    } catch (error) {
        console.error('Error inicializando módulo WhatsApp:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp Integrado...');
    await whatsappManager.closeAllSessions();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp Integrado...');
    await whatsappManager.closeAllSessions();
    process.exit(0);
});

// Iniciar el módulo
startUnifiedWhatsApp();