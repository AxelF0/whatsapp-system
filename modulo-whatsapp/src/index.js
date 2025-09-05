// servidor/modulo-whatsapp/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Servicios refactorizados para usar solo WhatsApp Web
const MultiSessionManager = require('./services/multiSessionManager');
const MessageProcessor = require('./services/messageProcessor');

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
const sessionManager = new MultiSessionManager();
const messageProcessor = new MessageProcessor();

// Variables globales
app.locals.sessionManager = sessionManager;
app.locals.messageProcessor = messageProcessor;
app.locals.gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
app.locals.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
app.locals.processingUrl = process.env.PROCESSING_URL || 'http://localhost:3002';

// ==================== RUTAS DE INICIALIZACIÓN ====================

// Inicializar todas las sesiones (agente + sistema)
app.post('/api/initialize', async (req, res) => {
    try {
        console.log('🚀 Inicializando sesiones múltiples...');

        const { 
            agentPhone, 
            agentName, 
            systemPhone, 
            systemName = 'Sistema RE/MAX' 
        } = req.body;

        if (!agentPhone || !agentName || !systemPhone) {
            return res.status(400).json({
                success: false,
                error: 'agentPhone, agentName y systemPhone son requeridos'
            });
        }

        const result = await sessionManager.initializeAllSessions({
            agent: { phone: agentPhone, name: agentName },
            system: { phone: systemPhone, name: systemName }
        });

        res.json({
            success: true,
            data: result,
            message: 'Sesiones inicializadas. Escanea los códigos QR para conectar.'
        });

    } catch (error) {
        console.error('❌ Error inicializando sesiones:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener QR de una sesión específica
app.get('/api/sessions/:sessionType/qr', async (req, res) => {
    try {
        const { sessionType } = req.params; // 'agent' or 'system'
        
        if (!['agent', 'system'].includes(sessionType)) {
            return res.status(400).json({
                success: false,
                error: 'sessionType debe ser "agent" o "system"'
            });
        }

        const qr = sessionManager.getSessionQR(sessionType);

        if (qr) {
            res.json({
                success: true,
                data: { 
                    qr,
                    sessionType,
                    instruction: `Escanea este código QR con el teléfono del ${sessionType === 'agent' ? 'agente' : 'sistema'}`
                }
            });
        } else {
            res.status(404).json({
                success: false,
                error: `QR no disponible para la sesión ${sessionType}`
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE SESIONES ====================

// Estado de todas las sesiones
app.get('/api/sessions/status', (req, res) => {
    try {
        const status = sessionManager.getAllSessionsStatus();

        res.json({
            success: true,
            data: {
                totalSessions: Object.keys(status).length,
                ready: Object.values(status).filter(s => s.status === 'ready').length,
                status: status,
                architecture: 'whatsapp-web-only'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reiniciar una sesión específica
app.post('/api/sessions/:sessionType/restart', async (req, res) => {
    try {
        const { sessionType } = req.params;
        
        if (!['agent', 'system'].includes(sessionType)) {
            return res.status(400).json({
                success: false,
                error: 'sessionType debe ser "agent" o "system"'
            });
        }

        await sessionManager.restartSession(sessionType);

        res.json({
            success: true,
            message: `Sesión ${sessionType} reiniciada correctamente`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Diagnosticar problemas de sesiones
app.get('/api/sessions/diagnose', async (req, res) => {
    try {
        const diagnosis = await sessionManager.diagnoseSessions();
        
        res.json({
            success: true,
            data: diagnosis,
            message: 'Diagnóstico de sesiones completado'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Limpiar archivos de autenticación (útil cuando las sesiones se cuelgan)
app.post('/api/sessions/clear-auth', async (req, res) => {
    try {
        await sessionManager.clearAuthSessions();
        
        res.json({
            success: true,
            message: 'Archivos de autenticación limpiados. Reinicia las sesiones.'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE MENSAJERÍA ====================

// Enviar mensaje desde el agente (al cliente)
app.post('/api/agent/send', async (req, res) => {
    try {
        const { to, message, mediaUrl, mediaType } = req.body;

        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y mensaje son requeridos'
            });
        }

        console.log(`📤 Enviando mensaje desde AGENTE a cliente ${to}`);

        const result = await sessionManager.sendMessage('agent', {
            to,
            message,
            mediaUrl,
            mediaType
        });

        res.json({
            success: true,
            data: result,
            message: 'Mensaje enviado desde el agente'
        });

    } catch (error) {
        console.error('❌ Error enviando mensaje del agente:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar mensaje desde el sistema (a agente/gerente)
app.post('/api/system/send', async (req, res) => {
    try {
        const { to, message } = req.body;

        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y mensaje son requeridos'
            });
        }

        console.log(`📤 Enviando mensaje desde SISTEMA a ${to}`);

        const result = await sessionManager.sendMessage('system', {
            to,
            message
        });

        res.json({
            success: true,
            data: result,
            message: 'Mensaje enviado desde el sistema'
        });

    } catch (error) {
        console.error('❌ Error enviando mensaje del sistema:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Health check
app.get('/api/health', async (req, res) => {
    const sessionsStatus = sessionManager.getAllSessionsStatus();
    
    res.json({
        success: true,
        service: 'whatsapp-multiple-sessions',
        status: 'healthy',
        sessions: sessionsStatus,
        timestamp: new Date().toISOString(),
        gatewayUrl: app.locals.gatewayUrl
    });
});

// Información del módulo
app.get('/api/info', (req, res) => {
    res.json({
        success: true,
        data: {
            module: 'whatsapp-web-only',
            version: '2.0.0',
            description: 'Módulo WhatsApp usando únicamente whatsapp-web.js con múltiples sesiones',
            sessions: {
                agent: {
                    purpose: 'Comunicación cliente-agente',
                    capabilities: [
                        'Recibe mensajes de clientes',
                        'Envía respuestas automáticas',
                        'Procesa consultas inmobiliarias'
                    ]
                },
                system: {
                    purpose: 'Comunicación agente/gerente-sistema',
                    capabilities: [
                        'Recibe comandos de backend',
                        'Valida usuarios registrados',
                        'Ejecuta operaciones del sistema'
                    ]
                }
            },
            flows: {
                clientToAgent: 'Cliente → Agente (WhatsApp-Web) → IA → Respuesta automática',
                agentToSystem: 'Agente/Gerente → Sistema (WhatsApp-Web) → Backend → Respuesta'
            }
        }
    });
});

// Estadísticas
app.get('/api/stats', (req, res) => {
    const stats = sessionManager.getStats();
    
    res.json({
        success: true,
        data: {
            ...stats,
            messageProcessor: messageProcessor.getStats(),
            timestamp: new Date().toISOString()
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

async function startMultiSessionWhatsApp() {
    try {
        console.log('\n🚀 Iniciando Módulo WhatsApp con Múltiples Sesiones');
        console.log('============================================');
        console.log('📱 Arquitectura: WhatsApp-Web.js únicamente');
        console.log('🔧 Sesiones: Agente + Sistema');
        console.log('============================================\n');

        // Configurar procesador de mensajes
        messageProcessor.configure({
            gatewayUrl: app.locals.gatewayUrl,
            databaseUrl: app.locals.databaseUrl,
            processingUrl: app.locals.processingUrl
        });

        // Configurar el manejador de mensajes para las sesiones
        sessionManager.setMessageProcessor(messageProcessor);

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n🌐 Servidor ejecutándose en puerto ${PORT}`);
            console.log('\n📋 Endpoints disponibles:');
            console.log('   POST /api/initialize - Inicializar sesiones');
            console.log('   GET  /api/sessions/:type/qr - Obtener QR');
            console.log('   GET  /api/sessions/status - Estado de sesiones');
            console.log('   GET  /api/sessions/diagnose - Diagnosticar problemas');
            console.log('   POST /api/sessions/clear-auth - Limpiar archivos auth');
            console.log('   POST /api/sessions/:type/restart - Reiniciar sesión');
            console.log('   POST /api/agent/send - Enviar desde agente');
            console.log('   POST /api/system/send - Enviar desde sistema');
            console.log('   GET  /api/health - Estado del módulo');
            console.log('\n💡 Para iniciar: POST /api/initialize con agentPhone, agentName, systemPhone');
        });

        // Monitor de sesiones cada 30 segundos
        setInterval(() => {
            sessionManager.monitorSessions();
        }, 30000);

    } catch (error) {
        console.error('💥 Error inicializando módulo WhatsApp:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp...');
    await sessionManager.closeAllSessions();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando Módulo WhatsApp...');
    await sessionManager.closeAllSessions();
    process.exit(0);
});

// Iniciar el módulo
startMultiSessionWhatsApp();