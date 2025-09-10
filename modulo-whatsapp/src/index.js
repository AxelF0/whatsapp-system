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
app.locals.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
app.locals.processingUrl = process.env.PROCESSING_URL || 'http://localhost:3002';

// Auto-cargar solo las sesiones previamente autenticadas
const autoLoadExistingSessions = async () => {
    try {
        console.log('🔍 Verificando sesiones WhatsApp previamente autenticadas...');
        
        const axios = require('axios');
        const databaseUrl = app.locals.databaseUrl;
        const fs = require('fs');
        const path = require('path');
        
        // Obtener todos los usuarios activos del sistema
        const response = await axios.get(`${databaseUrl}/api/users`, { timeout: 10000 });
        
        if (!response.data.success || !response.data.data || response.data.data.length === 0) {
            console.log('⚠️ No hay usuarios en el sistema');
            return;
        }
        
        const users = response.data.data;
        console.log(`📋 Verificando ${users.length} usuarios activos para sesiones existentes`);
        
        // Verificar qué usuarios tienen datos de autenticación guardados
        const authPath = '.wwebjs_auth';
        let authenticatedSessions = 0;
        
        for (const user of users) {
            try {
                const userName = `${user.nombre} ${user.apellido || ''}`.trim();
                const userPhone = user.telefono;
                const cleanPhone = userPhone.replace(/[^\d]/g, ''); // Solo números
                
                console.log(`🔍 Buscando sesión para: ${userName} (${cleanPhone})`);
                
                // Buscar session-{numero}
                const sessionPath = path.join(authPath, `session-${cleanPhone}`);
                
                if (fs.existsSync(sessionPath)) {
                    console.log(`✅ Sesión encontrada: session-${cleanPhone}`);
                    console.log(`🔄 Cargando sesión existente para: ${userName}`);
                    
                    // sessionType = número limpio
                    await sessionManager.loadExistingSession(cleanPhone, userPhone, userName);
                    authenticatedSessions++;
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.log(`⏭️ Sin sesión para: ${userName} - no existe session-${cleanPhone}`);
                }
                
            } catch (sessionError) {
                console.error(`❌ Error cargando sesión para ${user.nombre}:`, sessionError.message);
            }
        }
        
        console.log(`✅ Auto-carga de usuarios completada: ${authenticatedSessions} sesiones cargadas de ${users.length} usuarios`);
        
        // 🆕 VERIFICAR SESIÓN DEL SISTEMA
        console.log('\n🖥️ Verificando sesión del sistema...');
        
        // Números del sistema (agregar aquí los números que usa el sistema)
        const systemNumbers = [
            process.env.SYSTEM_PHONE_1 // Desde variables de entorno
        ].filter(Boolean); // Filtrar valores null/undefined
        
        for (const systemPhone of systemNumbers) {
            try {
                const cleanSystemPhone = systemPhone.replace(/[^\d]/g, '');
                console.log(`🔍 Buscando sesión sistema para: ${systemPhone}`);
                
                // Buscar sesión del sistema con diferentes formatos posibles
                const systemPaths = [
                    path.join(authPath, `session-system_${cleanSystemPhone}`), // session-system_59169173077
                    path.join(authPath, `session-agent_${cleanSystemPhone}`),  // session-agent_59169173077
                    path.join(authPath, `session-system`), // session-system
                ];
                
                let foundSystemPath = null;
                for (const testPath of systemPaths) {
                    if (fs.existsSync(testPath)) {
                        foundSystemPath = testPath;
                        console.log(`✅ Sesión sistema encontrada: ${testPath}`);
                        break;
                    }
                }
                
                if (foundSystemPath) {
                    console.log(`🔄 Cargando sesión del SISTEMA`);
                    
                    // ✅ MANTENER sessionType 'system' FIJO para el sistema
                    await sessionManager.loadExistingSession('system', systemPhone, 'Sistema RE/MAX');
                    authenticatedSessions++;
                } else {
                    console.log(`⏭️ Sin sesión del sistema para: ${systemPhone}`);
                }
                
            } catch (systemError) {
                console.error(`❌ Error cargando sesión del sistema ${systemPhone}:`, systemError.message);
            }
        }
        
        console.log(`\n✅ Auto-carga TOTAL completada: ${authenticatedSessions} sesiones cargadas (${users.length} usuarios + sistema)`);
        
    } catch (error) {
        console.error('❌ Error en auto-carga:', error.message);
    }
};

// Ejecutar auto-carga después de un breve retraso para que el servidor esté listo
setTimeout(autoLoadExistingSessions, 5000);

// ==================== RUTAS DE INICIALIZACIÓN ====================

// Crear sesión individual para un usuario específico
app.post('/api/sessions/create', async (req, res) => {
    try {
        const { sessionType, phone, name } = req.body;
        
        if (!sessionType || !phone || !name) {
            return res.status(400).json({
                success: false,
                error: 'sessionType, phone y name son requeridos'
            });
        }
        
        console.log(`📱 Creando sesión individual: ${name} (${phone})`);
        
        const result = await sessionManager.createSession(sessionType, phone, name);
        
        res.json({
            success: true,
            data: result,
            message: `Sesión ${sessionType} creada para ${name}. Escanea el código QR para conectar.`
        });
        
    } catch (error) {
        console.error('❌ Error creando sesión individual:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener QR de una sesión específica por sessionType
app.get('/api/sessions/:sessionType/qr', async (req, res) => {
    try {
        const { sessionType } = req.params;
        
        const qrData = sessionManager.getSessionQR(sessionType);
        
        if (qrData) {
            res.json({
                success: true,
                data: { 
                    qr: qrData.qr || qrData, // Mantener compatibilidad con formato anterior
                    sessionType,
                    instruction: `Escanea este código QR con WhatsApp`,
                    generatedAt: qrData.generatedAt,
                    ageMinutes: qrData.ageMinutes,
                    isExpiringSoon: qrData.isExpiringSoon,
                    info: qrData.info,
                    sessionStatus: qrData.sessionStatus
                }
            });
        } else {
            res.json({
                success: false,
                error: `QR no disponible para la sesión ${sessionType}. La sesión podría estar ya conectada o no inicializada.`
            });
        }
        
    } catch (error) {
        console.error('❌ Error obteniendo QR:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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

// Detener todas las sesiones del sistema
app.post('/api/sessions/stop-all', async (req, res) => {
    try {
        console.log('🛑 Deteniendo TODAS las sesiones del sistema...');
        
        // Cerrar todas las sesiones
        const result = await sessionManager.closeAllSessions();
        
        console.log('✅ Todas las sesiones han sido detenidas');
        
        res.json({
            success: true,
            message: 'Todas las sesiones han sido detenidas exitosamente',
            data: {
                sessionsStopped: result.sessionsStopped || 0,
                details: result.details || 'Sesiones cerradas correctamente'
            }
        });

    } catch (error) {
        console.error('❌ Error deteniendo sesiones:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Detener una sesión específica
app.post('/api/sessions/:sessionType/stop', async (req, res) => {
    try {
        const { sessionType } = req.params;
        const { removeAuth, phone } = req.body;
        
        console.log(`🛑 Deteniendo sesión: ${sessionType}${removeAuth ? ' (eliminando auth)' : ''}`);
        
        if (removeAuth && phone) {
            // Para usuarios desactivados: cerrar sesión Y eliminar archivos de autenticación
            await sessionManager.closeSessionAndRemoveAuth(sessionType, phone);
        } else {
            // Cierre normal: mantener archivos de autenticación
            await sessionManager.closeSession(sessionType);
        }
        
        res.json({
            success: true,
            message: `Sesión ${sessionType} detenida exitosamente${removeAuth ? ' y auth eliminada' : ''}`
        });

    } catch (error) {
        console.error(`❌ Error deteniendo sesión ${req.params.sessionType}:`, error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reiniciar TODAS las sesiones del sistema masivamente
app.post('/api/sessions/restart-all', async (req, res) => {
    try {
        console.log('🔄 Reiniciando TODAS las sesiones del sistema...');
        
        const axios = require('axios');
        const databaseUrl = app.locals.databaseUrl;
        
        // 1. Cerrar todas las sesiones actuales
        console.log('🛑 Cerrando todas las sesiones actuales...');
        await sessionManager.closeAllSessions();
        
        // 2. Limpiar archivos de autenticación si se solicita
        if (req.body.clearAuth) {
            console.log('🧹 Limpiando archivos de autenticación...');
            await sessionManager.clearAuthSessions();
        }
        
        // 3. Obtener todos los usuarios activos del sistema
        const response = await axios.get(`${databaseUrl}/api/users`, { timeout: 10000 });
        
        if (!response.data.success || !response.data.data || response.data.data.length === 0) {
            return res.json({
                success: true,
                message: 'No hay usuarios en el sistema para reiniciar sesiones',
                data: { sessionsRestarted: 0 }
            });
        }
        
        const users = response.data.data;
        console.log(`📋 Reiniciando sesiones para ${users.length} usuarios...`);
        
        let sessionsRestarted = 0;
        let errors = [];
        
        // 4. Reinicializar sesión para cada usuario
        for (const user of users) {
            try {
                const sessionType = `user_${user.id}`;
                const userName = `${user.nombre} ${user.apellido || ''}`.trim();
                const userPhone = user.telefono;
                
                console.log(`📱 Reiniciando sesión: ${userName} (${userPhone})`);
                await sessionManager.createSession(sessionType, userPhone, userName);
                
                sessionsRestarted++;
                
                // Pausa entre reinicializaciones
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (sessionError) {
                console.error(`❌ Error reiniciando sesión para ${user.nombre}:`, sessionError.message);
                errors.push(`${user.nombre}: ${sessionError.message}`);
            }
        }
        
        console.log(`✅ Reinicio masivo completado: ${sessionsRestarted} sesiones reiniciadas`);
        
        res.json({
            success: true,
            message: `Reinicio masivo completado`,
            data: {
                totalUsers: users.length,
                sessionsRestarted,
                errors: errors.length > 0 ? errors : null
            }
        });

    } catch (error) {
        console.error('❌ Error en reinicio masivo:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== RUTAS DE MENSAJERÍA ====================

// Envío masivo a clientes del agente
app.post('/api/agent/send-bulk', async (req, res) => {
    try {
        const { agentPhone, message, mediaUrl, mediaType, delayBetweenMessages } = req.body;

        console.log('📤 ENVÍO MASIVO - Datos recibidos:');
        console.log(`   👤 agentPhone: ${agentPhone || 'UNDEFINED'}`);
        console.log(`   📝 message: '${message ? message.substring(0, 100) + '...' : 'UNDEFINED'}' (len: ${message?.length || 0})`);
        console.log(`   ⏱️ delayBetweenMessages: ${delayBetweenMessages || 'default 2000ms'}`);

        if (!agentPhone || !message) {
            return res.status(400).json({
                success: false,
                error: 'agentPhone y message son requeridos para envío masivo'
            });
        }

        // Obtener agente por teléfono desde la base de datos
        const axios = require('axios');
        const databaseUrl = app.locals.databaseUrl;
        
        console.log('🔍 Buscando agente en base de datos...');
        const agentResponse = await axios.get(`${databaseUrl}/api/users/by-phone/${agentPhone}`, { 
            timeout: 10000 
        });

        if (!agentResponse.data.success || !agentResponse.data.data) {
            return res.status(404).json({
                success: false,
                error: `Agente con teléfono ${agentPhone} no encontrado en el sistema`
            });
        }

        const agent = agentResponse.data.data;
        console.log(`✅ Agente encontrado: ${agent.nombre} ${agent.apellido} (ID: ${agent.id})`);

        // Obtener clientes asignados a este agente
        console.log('📋 Obteniendo clientes asignados al agente...');
        const clientsResponse = await axios.get(`${databaseUrl}/api/clients/by-agent/${agent.id}`, { 
            timeout: 10000 
        });

        if (!clientsResponse.data.success || !clientsResponse.data.data || clientsResponse.data.data.length === 0) {
            return res.status(200).json({
                success: true,
                message: `El agente ${agent.nombre} no tiene clientes asignados`,
                data: {
                    agent: `${agent.nombre} ${agent.apellido}`,
                    clientsFound: 0,
                    messagesSent: 0,
                    errors: []
                }
            });
        }

        const clients = clientsResponse.data.data;
        console.log(`📱 ${clients.length} clientes encontrados para el agente ${agent.nombre}`);

        // Configurar control de velocidad (rate limiting)
        const delay = parseInt(delayBetweenMessages) || 2000; // 2 segundos por defecto
        const maxClientsPerBatch = 50; // Límite de clientes por envío masivo
        
        if (clients.length > maxClientsPerBatch) {
            return res.status(400).json({
                success: false,
                error: `Demasiados clientes (${clients.length}). Máximo permitido: ${maxClientsPerBatch}`
            });
        }

        // Iniciar envío masivo
        console.log(`🚀 Iniciando envío masivo a ${clients.length} clientes con delay de ${delay}ms`);
        
        let messagesSent = 0;
        let errors = [];
        const startTime = Date.now();

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            
            try {
                console.log(`📤 [${i + 1}/${clients.length}] Enviando a: ${client.nombre || 'Sin nombre'} (${client.telefono})`);
                
                // Usar la sesión del agente específico
                const sessionToUse = agentPhone;
                const result = await sessionManager.sendMessage(sessionToUse, {
                    to: client.telefono,
                    message,
                    mediaUrl,
                    mediaType
                });

                messagesSent++;
                console.log(`   ✅ Mensaje enviado exitosamente a ${client.nombre || client.telefono}`);
                
                // Delay entre mensajes (excepto en el último)
                if (i < clients.length - 1) {
                    console.log(`   ⏳ Esperando ${delay}ms antes del siguiente envío...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                console.error(`   ❌ Error enviando a ${client.nombre || client.telefono}: ${error.message}`);
                errors.push({
                    client: `${client.nombre || 'Sin nombre'} (${client.telefono})`,
                    error: error.message
                });
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ Envío masivo completado en ${Math.round(totalTime / 1000)}s`);
        console.log(`   📊 Enviados: ${messagesSent}/${clients.length}`);
        console.log(`   ❌ Errores: ${errors.length}`);

        res.json({
            success: true,
            message: `Envío masivo completado para ${agent.nombre} ${agent.apellido}`,
            data: {
                agent: `${agent.nombre} ${agent.apellido}`,
                clientsFound: clients.length,
                messagesSent,
                errors: errors.length > 0 ? errors : null,
                totalTimeSeconds: Math.round(totalTime / 1000),
                averageDelayMs: delay
            }
        });

    } catch (error) {
        console.error('❌ Error en envío masivo:', error.message);
        res.status(500).json({
            success: false,
            error: `Error en envío masivo: ${error.message}`
        });
    }
});

// Enviar mensaje desde el agente (al cliente)
app.post('/api/agent/send', async (req, res) => {
    try {
        const { to, message, mediaUrl, mediaType, agentPhone } = req.body;

        // 🔍 LOG DETALLADO - WHATSAPP RECIBE DATOS FINALES
        console.log('🔍 WHATSAPP PASO 1 - Datos recibidos en /api/agent/send:');
        console.log(`   📞 to: ${to || 'UNDEFINED'}`);
        console.log(`   📝 message: '${message ? message.substring(0, 100) + '...' : 'UNDEFINED'}' (len: ${message?.length || 0})`);
        console.log(`   👤 agentPhone: ${agentPhone || 'UNDEFINED'}`);
        console.log(`   🎬 mediaUrl: ${req.body.mediaUrl || 'none'}`);
        console.log(`   📋 bodyKeys: [${Object.keys(req.body).join(', ')}]`);

        if (!to || !message) {
            console.error('❌ Faltan datos requeridos:', { 
                hasTo: !!to, 
                hasMessage: !!message,
                body: req.body 
            });
            return res.status(400).json({
                success: false,
                error: 'Destinatario y mensaje son requeridos'
            });
        }

        console.log(`📤 Enviando mensaje desde AGENTE ${agentPhone || 'default'} a cliente ${to}`);

        // Usar la sesión del agente específico si se proporciona, sino usar 'agent'
        const sessionToUse = agentPhone || 'agent';
        const result = await sessionManager.sendMessage(sessionToUse, {
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
        const { to, message, mediaUrl, mediaType } = req.body;

        if (!to || (!message && !mediaUrl)) {
            return res.status(400).json({
                success: false,
                error: 'Destinatario y (mensaje o media) son requeridos'
            });
        }

        console.log(`📤 Enviando ${mediaUrl ? 'media' : 'mensaje'} desde SISTEMA a ${to}`);

        const result = await sessionManager.sendMessage('system', {
            to,
            message: message || '',
            mediaUrl,
            mediaType
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
            console.log('   POST /api/agent/send-bulk - Envío masivo a clientes');
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