// servidor/modulo-whatsapp/whatsapp-api/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const WhatsAppApiService = require('./services/whatsAppApiService');
const WebhookHandler = require('./services/webhookHandler');

const app = express();
const PORT = process.env.WHATSAPP_API_PORT || 3007;

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
const whatsAppApiService = new WhatsAppApiService();
const webhookHandler = new WebhookHandler(whatsAppApiService);

// Variables globales
app.locals.apiService = whatsAppApiService;
app.locals.webhookHandler = webhookHandler;

// ==================== RUTAS DE WEBHOOK ====================

// Webhook de WhatsApp (GET para verificación, POST para eventos)
app.all('/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// Webhook alternativo en la ruta esperada por el gateway
app.post('/api/whatsapp/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// Verificación de webhook
app.get('/api/whatsapp/webhook', (req, res) => {
    webhookHandler.handleWebhook(req, res);
});

// ==================== RUTAS DE ENVÍO DE MENSAJES ====================

// Enviar mensaje de texto
app.post('/api/send/text', async (req, res) => {
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
        console.error('❌ Error enviando mensaje:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar mensaje interactivo con botones
app.post('/api/send/interactive', async (req, res) => {
    try {
        const { to, bodyText, buttons, headerText, footerText } = req.body;

        if (!to || !bodyText || !buttons || buttons.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario, texto y botones son requeridos'
            });
        }

        const result = await whatsAppApiService.sendInteractiveMessage(
            to, 
            bodyText, 
            buttons, 
            headerText, 
            footerText
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error enviando mensaje interactivo:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar lista
app.post('/api/send/list', async (req, res) => {
    try {
        const { to, bodyText, buttonText, sections, headerText, footerText } = req.body;

        if (!to || !bodyText || !buttonText || !sections) {
            return res.status(400).json({
                success: false,
                error: 'Faltan parámetros requeridos'
            });
        }

        const result = await whatsAppApiService.sendListMessage(
            to,
            bodyText,
            buttonText,
            sections,
            headerText,
            footerText
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error enviando lista:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enviar plantilla
app.post('/api/send/template', async (req, res) => {
    try {
        const { to, templateName, languageCode, components } = req.body;

        if (!to || !templateName) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y nombre de plantilla son requeridos'
            });
        }

        const result = await whatsAppApiService.sendTemplate(
            to,
            templateName,
            languageCode || 'es',
            components || []
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error enviando plantilla:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================

// Health check
app.get('/api/health', (req, res) => {
    const stats = whatsAppApiService.getStats();
    const webhookStats = webhookHandler.getStats();

    res.json({
        success: true,
        service: 'whatsapp-api',
        status: stats.isReady ? 'ready' : 'not_ready',
        systemNumber: stats.systemNumber,
        stats: {
            api: stats,
            webhook: webhookStats
        },
        timestamp: new Date().toISOString()
    });
});

// Obtener información del número
app.get('/api/phone/status', async (req, res) => {
    try {
        const status = await whatsAppApiService.getPhoneNumberStatus();

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

// Obtener perfil de negocio
app.get('/api/business/profile', async (req, res) => {
    try {
        const profile = await whatsAppApiService.getBusinessProfile();

        res.json({
            success: true,
            data: profile
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Actualizar perfil de negocio
app.post('/api/business/profile', async (req, res) => {
    try {
        const result = await whatsAppApiService.updateBusinessProfile(req.body);

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

// Obtener plantillas disponibles
app.get('/api/templates', async (req, res) => {
    try {
        const templates = await whatsAppApiService.getMessageTemplates();

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

async function startWhatsAppApi() {
    try {
        console.log('🌐 Inicializando API Oficial de WhatsApp...');
        console.log('📱 Número del sistema:', process.env.SYSTEM_WHATSAPP_NUMBER || '59180000000');

        // Verificar configuración
        if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
            console.warn('⚠️ ADVERTENCIA: Credenciales de WhatsApp API no configuradas');
            console.warn('Configura las siguientes variables en .env:');
            console.warn('  - WHATSAPP_PHONE_NUMBER_ID');
            console.warn('  - WHATSAPP_ACCESS_TOKEN');
            console.warn('  - WHATSAPP_BUSINESS_ACCOUNT_ID');
            console.warn('  - WHATSAPP_VERIFY_TOKEN');
            console.warn('\n📝 El módulo funcionará en modo simulación');
        } else {
            // Inicializar la API
            try {
                await whatsAppApiService.initialize();
                console.log('✅ API de WhatsApp inicializada correctamente');
            } catch (error) {
                console.error('❌ Error inicializando API:', error.message);
                console.log('📝 Continuando en modo simulación');
            }
        }

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`✅ API de WhatsApp ejecutándose en puerto ${PORT}`);
            console.log(`🌐 Endpoints disponibles:`);
            console.log(`   - http://localhost:${PORT}/api/health`);
            console.log(`   - http://localhost:${PORT}/webhook (para configurar en Meta)`);
            console.log(`   - POST http://localhost:${PORT}/api/send/text`);
            console.log(`   - POST http://localhost:${PORT}/api/send/interactive`);
            console.log(`   - POST http://localhost:${PORT}/api/send/template`);
            console.log(`\n📡 Webhook URL para Meta:`);
            console.log(`   ${process.env.PUBLIC_URL || 'https://tu-dominio.com'}/webhook`);
            console.log(`   Verify Token: ${process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token_here'}`);
        });

    } catch (error) {
        console.error('❌ Error iniciando API de WhatsApp:', error.message);
        process.exit(1);
    }
}

// Manejo graceful de shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando API de WhatsApp...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Cerrando API de WhatsApp...');
    process.exit(0);
});

// Iniciar el módulo
startWhatsAppApi();