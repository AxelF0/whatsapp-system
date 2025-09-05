// servidor/modulo-whatsapp/src/services/multiSessionManager.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class MultiSessionManager {
    constructor() {
        this.sessions = new Map(); // 'agent' | 'system' -> sessionData
        this.qrCodes = new Map();  // 'agent' | 'system' -> qrCode
        this.messageProcessor = null;
        
        // Control de mensajes para evitar duplicados
        this.messageCache = new Map(); // messageId -> timestamp
        
        // Usar directorio por defecto de whatsapp-web.js (no crear carpeta custom)
        // Esto permite que whatsapp-web.js maneje las sesiones automáticamente
        
        // Configuración por defecto
        this.config = {
            agent: { phone: null, name: null },
            system: { phone: null, name: null }
        };
        
        // Limpiar cache cada 5 minutos
        setInterval(() => this.cleanMessageCache(), 5 * 60 * 1000);
    }

    // Ya no necesitamos crear directorio personalizado
    // whatsapp-web.js creará .wwebjs_auth automáticamente

    // Configurar procesador de mensajes
    setMessageProcessor(processor) {
        this.messageProcessor = processor;
    }

    // Inicializar todas las sesiones
    async initializeAllSessions(config) {
        console.log('🚀 Inicializando sesiones múltiples...');

        this.config = config;
        const results = {};

        try {
            // Crear sesión del agente
            console.log(`\n📱 Creando sesión AGENTE: ${config.agent.name} (${config.agent.phone})`);
            results.agent = await this.createSession('agent', config.agent.phone, config.agent.name);

            // Crear sesión del sistema
            console.log(`\n🖥️ Creando sesión SISTEMA: ${config.system.name} (${config.system.phone})`);
            results.system = await this.createSession('system', config.system.phone, config.system.name);

            console.log('\n✅ Ambas sesiones inicializadas correctamente');
            console.log('📱 Escanea los códigos QR mostrados arriba para conectar cada sesión');

            return results;

        } catch (error) {
            console.error('❌ Error inicializando sesiones:', error.message);
            
            // Limpiar sesiones parcialmente creadas
            await this.closeAllSessions();
            throw error;
        }
    }

    // Crear una sesión individual
    async createSession(sessionType, phone, name) {
        console.log(`📱 Creando sesión ${sessionType.toUpperCase()}: ${name} (${phone})`);

        if (this.sessions.has(sessionType)) {
            const existingSession = this.sessions.get(sessionType);
            
            // Si la sesión existe y está funcionando, no la recrear
            if (existingSession.status === 'ready') {
                console.log(`✅ Sesión ${sessionType} ya está activa y funcionando`);
                return {
                    sessionType,
                    phone: existingSession.phone,
                    name: existingSession.name,
                    status: existingSession.status,
                    clientId: existingSession.clientId
                };
            }
            
            console.log(`⚠️ Sesión ${sessionType} existe pero no está ready (${existingSession.status}), recreando...`);
            await this.closeSession(sessionType);
        }

        // Configuración del cliente WhatsApp
        const clientId = `${sessionType}_${phone.replace(/[^\d]/g, '')}`;
        
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: clientId
                // No especificar dataPath - usar por defecto .wwebjs_auth
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-extensions',
                    '--disable-dev-shm-usage',
                    '--no-first-run'
                ]
            }
        });

        // Crear datos de la sesión
        const sessionData = {
            type: sessionType,
            phone: phone,
            name: name,
            client: client,
            status: 'initializing',
            createdAt: new Date(),
            lastActivity: new Date(),
            messagesReceived: 0,
            messagesSent: 0,
            clientId: clientId
        };

        this.sessions.set(sessionType, sessionData);

        // Configurar eventos del cliente
        this.setupClientEvents(client, sessionType, name);

        // Inicializar cliente
        try {
            await client.initialize();
            console.log(`✅ Cliente ${sessionType.toUpperCase()} inicializado`);
            
            return {
                sessionType,
                phone,
                name,
                status: sessionData.status,
                clientId
            };

        } catch (error) {
            console.error(`❌ Error inicializando cliente ${sessionType}:`, error.message);
            this.sessions.delete(sessionType);
            throw error;
        }
    }

    // Configurar eventos del cliente WhatsApp
    setupClientEvents(client, sessionType, name) {
        const sessionData = this.sessions.get(sessionType);
        const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';

        console.log(`🔧 Configurando eventos para ${sessionType.toUpperCase()}`);
        console.log(`📋 Cliente inicializado: ${!!client}`);
        console.log(`📋 SessionData: ${!!sessionData}`);

        // QR Code para conexión
        client.on('qr', (qr) => {
            console.log(`\n${sessionIcon} QR generado para ${sessionType.toUpperCase()} (${name}):`);
            qrcode.generate(qr, { small: true });
            console.log(`📱 Escanea este código QR con el teléfono: ${sessionData.phone}`);
            console.log('────────────────────────────────────────');
            
            // Guardar QR para consulta posterior
            this.qrCodes.set(sessionType, qr);
            sessionData.status = 'waiting_qr';
            sessionData.qrCode = qr;
        });

        // Cliente listo
        client.on('ready', async () => {
            console.log(`\n${sessionIcon} ${sessionType.toUpperCase()} CONECTADO: ${name}`);
            console.log(`🎉 La sesión ${sessionType} está ahora activa`);
            
            sessionData.status = 'ready';
            sessionData.connectedAt = new Date();
            this.qrCodes.delete(sessionType);

            // VERIFICAR QUE REALMENTE PUEDE RECIBIR MENSAJES
            try {
                const info = await client.getState();
                console.log(`📱 ${sessionIcon} Estado del cliente: ${info}`);
                
                const contacts = await client.getContacts();
                console.log(`👥 ${sessionIcon} Contactos cargados: ${contacts.length}`);
                
                // Verificar que puede obtener chats
                const chats = await client.getChats();
                console.log(`💬 ${sessionIcon} Chats disponibles: ${chats.length}`);
                
            } catch (error) {
                console.error(`❌ ${sessionIcon} ERROR verificando estado real:`, error.message);
                console.error(`⚠️ ${sessionIcon} Sesión puede estar en estado falso 'ready'`);
            }
        });

        // Mensaje recibido
        client.on('message', async (message) => {
            try {
                console.log(`\n🔔 EVENTO MESSAGE DISPARADO en ${sessionType.toUpperCase()}`);
                console.log(`   📱 Estado sesión: ${sessionData.status}`);
                console.log(`   🔍 From: ${message.from}`);
                console.log(`   📝 Body: "${message.body}"`);
                console.log(`   🏷️ Type: ${message.type}`);

                // Verificar que la sesión esté lista
                if (sessionData.status !== 'ready') {
                    console.log(`⚠️ Sesión ${sessionType} no está ready, ignorando mensaje`);
                    return;
                }

                // Filtrar mensajes del sistema que no necesitamos procesar
                if (this.shouldIgnoreMessage(message)) {
                    console.log(`🚫 Mensaje ignorado por filtros`);
                    return;
                }

                sessionData.messagesReceived++;
                sessionData.lastActivity = new Date();

                console.log(`\n${sessionIcon} Procesando mensaje en ${sessionType.toUpperCase()}:`);
                console.log(`   📞 De: ${message.from}`);
                console.log(`   📝 Tipo: ${message.type}`);
                console.log(`   💬 Contenido: ${this.getMessagePreview(message)}`);

                // Verificar que tenemos procesador
                if (!this.messageProcessor) {
                    console.error(`❌ NO HAY PROCESADOR DE MENSAJES configurado`);
                    return;
                }

                console.log(`📤 Enviando a handleIncomingMessage...`);
                // Procesar según el tipo de sesión
                await this.handleIncomingMessage(message, sessionType);

            } catch (error) {
                console.error(`❌ Error procesando mensaje en ${sessionType}:`, error.message);
                console.error(`❌ Stack:`, error.stack);
            }
        });

        // Desconexión
        client.on('disconnected', (reason) => {
            console.log(`⚠️ ${sessionIcon} ${sessionType.toUpperCase()} desconectado: ${reason}`);
            sessionData.status = 'disconnected';
            sessionData.disconnectedAt = new Date();
        });

        // Error de autenticación
        client.on('auth_failure', (msg) => {
            console.error(`❌ ${sessionIcon} Falla de autenticación en ${sessionType}: ${msg}`);
            sessionData.status = 'auth_failed';
            console.log(`💡 Tip: Elimina la carpeta de sesión para ${sessionType} y vuelve a intentar`);
        });

        // Cargando
        client.on('loading_screen', (percent, message) => {
            if (percent % 20 === 0) { // Solo mostrar cada 20%
                console.log(`⏳ ${sessionIcon} ${sessionType} cargando... ${percent}% - ${message}`);
            }
            sessionData.status = 'loading';
        });

        // Evento de autenticación exitosa (pero aún no ready)
        client.on('authenticated', () => {
            console.log(`🔐 ${sessionIcon} ${sessionType} autenticado correctamente`);
            sessionData.status = 'authenticated';
            
            // Timeout para verificar si ready nunca llega
            setTimeout(() => {
                if (sessionData.status === 'authenticated') {
                    console.log(`⚠️ ${sessionIcon} ${sessionType} autenticado pero 'ready' nunca llegó`);
                    console.log(`🔄 Forzando estado ready...`);
                    sessionData.status = 'ready';
                    sessionData.connectedAt = new Date();
                    this.qrCodes.delete(sessionType);
                    console.log(`✅ ${sessionIcon} ${sessionType.toUpperCase()} FORZADO A READY`);
                }
            }, 30000); // 30 segundos después de authenticated
        });

        // Eventos adicionales para debugging
        client.on('change_state', (state) => {
            console.log(`🔄 ${sessionIcon} ${sessionType} cambio de estado: ${state}`);
            if (state === 'CONNECTED') {
                console.log(`📱 ${sessionIcon} ${sessionType} WhatsApp conectado`);
                // Si no está ready pero está conectado, forzar ready
                if (sessionData.status !== 'ready') {
                    setTimeout(() => {
                        if (sessionData.status !== 'ready') {
                            console.log(`🔄 Forzando ready por estado CONNECTED`);
                            sessionData.status = 'ready';
                            sessionData.connectedAt = new Date();
                            this.qrCodes.delete(sessionType);
                        }
                    }, 3000);
                }
            }
        });

        // Timeout para detectar sesiones colgadas
        setTimeout(() => {
            if (sessionData.status === 'initializing') {
                console.log(`⚠️ ${sessionIcon} Timeout: ${sessionType} sigue en 'initializing' después de 60s`);
                sessionData.status = 'timeout';
                console.log(`💡 Posibles causas:`);
                console.log(`   - Sesión previa corrupta`);
                console.log(`   - Problemas de red`);
                console.log(`   - Archivos .wwebjs_auth corruptos`);
                
                // Auto-retry una sola vez
                if (!sessionData.retryAttempted) {
                    console.log(`🔄 Intentando recuperación automática...`);
                    sessionData.retryAttempted = true;
                    this.restartSession(sessionType).catch(err => {
                        console.error(`❌ Recovery falló: ${err.message}`);
                    });
                }
            }
        }, 60000); // 60 segundos
    }

    // Determinar si ignorar un mensaje
    shouldIgnoreMessage(message) {
        const ignoredTypes = [
            'e2e_notification',
            'notification_template',
            'gp2'
        ];

        if (ignoredTypes.includes(message.type)) {
            return true;
        }

        // Ignorar mensajes sin contenido procesable
        if (!message.body && !['image', 'video', 'audio', 'document', 'location'].includes(message.type)) {
            return true;
        }

        return false;
    }

    // Obtener preview del mensaje
    getMessagePreview(message) {
        switch (message.type) {
            case 'chat':
                return message.body ? `"${message.body.substring(0, 100)}${message.body.length > 100 ? '...' : ''}"` : '';
            case 'image':
                return `[IMAGEN]${message.caption ? ` "${message.caption}"` : ''}`;
            case 'video':
                return `[VIDEO]${message.caption ? ` "${message.caption}"` : ''}`;
            case 'audio':
            case 'ptt':
                return '[AUDIO]';
            case 'document':
                return `[DOCUMENTO]${message.filename ? ` ${message.filename}` : ''}`;
            case 'location':
                return '[UBICACIÓN]';
            default:
                return `[${message.type.toUpperCase()}]`;
        }
    }

    // Manejar mensaje entrante según el tipo de sesión
    async handleIncomingMessage(message, sessionType) {
        console.log(`🔄 INICIO handleIncomingMessage - sessionType: ${sessionType}`);
        
        if (!this.messageProcessor) {
            console.error('❌ No hay procesador de mensajes configurado');
            return;
        }

        const sessionData = this.sessions.get(sessionType);
        console.log(`📋 Sesión encontrada: ${sessionData.name} (${sessionData.phone})`);
        
        // Crear clave única para el mensaje
        const messageKey = `${sessionType}_${message.from}_${message.id._serialized}_${message.timestamp}`;
        
        // Verificar si ya procesamos este mensaje
        if (this.isMessageDuplicate(messageKey)) {
            console.log(`🚫 Mensaje duplicado detectado y omitido: ${messageKey}`);
            return;
        }
        
        // Marcar mensaje como procesado
        this.cacheMessage(messageKey);
        console.log(`✅ Mensaje marcado como procesado: ${messageKey}`);
        
        // Preparar datos del mensaje
        const messageData = {
            id: message.id._serialized,
            from: message.from,
            to: sessionData.phone,
            body: message.body || this.extractMessageContent(message),
            type: message.type,
            timestamp: new Date(message.timestamp * 1000),
            sessionType: sessionType,
            sessionName: sessionData.name
        };

        console.log(`📦 Datos del mensaje preparados:`, {
            id: messageData.id,
            from: messageData.from,
            body: messageData.body,
            sessionType: messageData.sessionType
        });

        try {
            // Verificar si el mensaje viene del propio sistema (evitar bucles)
            const systemPhones = ['59171337051@c.us', '+59171337051'];
            if (systemPhones.includes(message.from)) {
                console.log(`🚫 IGNORANDO: Mensaje del propio sistema detectado: ${message.from}`);
                return;
            }
            
            if (sessionType === 'agent') {
                // Mensajes al AGENTE = consultas de clientes
                console.log(`📨 RUTA AGENTE: Procesando consulta de cliente: ${message.from}`);
                const result = await this.messageProcessor.processClientMessage(messageData);
                console.log(`✅ Resultado processClientMessage:`, result);
                
            } else if (sessionType === 'system') {
                // Mensajes al SISTEMA = comandos de agentes/gerentes
                console.log(`🔧 RUTA SISTEMA: Procesando comando del sistema: ${message.from}`);
                console.log(`📋 Mensaje recibido: "${messageData.body}"`);
                
                const result = await this.messageProcessor.processSystemMessage(messageData);
                console.log(`✅ Resultado processSystemMessage:`, result);
            }

            console.log(`✅ handleIncomingMessage completado para ${sessionType}`);

        } catch (error) {
            console.error(`❌ Error procesando mensaje ${sessionType}:`, error.message);
            console.error(`❌ Error completo:`, error);
        }
    }

    // Extraer contenido del mensaje según su tipo
    extractMessageContent(message) {
        switch (message.type) {
            case 'image':
                return `[IMAGEN]${message.caption ? ` ${message.caption}` : ''}`;
            case 'video':
                return `[VIDEO]${message.caption ? ` ${message.caption}` : ''}`;
            case 'audio':
            case 'ptt':
                return '[AUDIO]';
            case 'document':
                return `[DOCUMENTO]${message.filename ? ` ${message.filename}` : ''}`;
            case 'location':
                return `[UBICACIÓN] ${message.latitude}, ${message.longitude}`;
            case 'vcard':
                return '[CONTACTO]';
            case 'sticker':
                return '[STICKER]';
            default:
                return message.body || `[${message.type?.toUpperCase() || 'UNKNOWN'}]`;
        }
    }

    // Control de mensajes duplicados
    isMessageDuplicate(messageKey) {
        return this.messageCache.has(messageKey);
    }

    cacheMessage(messageKey) {
        this.messageCache.set(messageKey, Date.now());
        // Limpiar después de 5 minutos
        setTimeout(() => this.messageCache.delete(messageKey), 5 * 60 * 1000);
    }

    // Limpiar cache de mensajes antiguos
    cleanMessageCache() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutos
        
        for (const [key, timestamp] of this.messageCache.entries()) {
            if (now - timestamp > maxAge) {
                this.messageCache.delete(key);
            }
        }
        
        console.log(`🧹 Cache limpiado: ${this.messageCache.size} mensajes en cache`);
    }

    generateMessageKey(sessionType, to, message) {
        const cleanTo = to.replace(/[^\d]/g, '');
        const messagePreview = message.substring(0, 50);
        const timestamp = Date.now();
        return `${sessionType}_${cleanTo}_${messagePreview}_${timestamp}`;
    }

    // Enviar mensaje desde una sesión específica
    async sendMessage(sessionType, messageData) {
        const sessionData = this.sessions.get(sessionType);
        
        if (!sessionData) {
            throw new Error(`No existe la sesión ${sessionType}`);
        }

        if (sessionData.status !== 'ready') {
            throw new Error(`Sesión ${sessionType} no está lista (estado: ${sessionData.status})`);
        }

        // Generar clave única para el mensaje
        const messageKey = this.generateMessageKey(sessionType, messageData.to, messageData.message);

        // Verificar duplicados
        if (this.isMessageDuplicate(messageKey)) {
            console.log('⚠️ Mensaje duplicado detectado:', messageKey);
            return {
                success: false,
                error: 'Mensaje duplicado detectado',
                messageKey
            };
        }

        const { client } = sessionData;
        const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';

        try {
            // Marcar mensaje como en proceso
            this.cacheMessage(messageKey);

            // Formatear número de destino
            const cleanNumber = messageData.to.replace(/[^\d]/g, '');
            const chatId = cleanNumber.includes('@') ? cleanNumber : cleanNumber + "@c.us";

            console.log(`\n${sessionIcon} Enviando desde ${sessionType.toUpperCase()}:`);
            console.log(`   📞 A: ${chatId}`);
            console.log(`   💬 Mensaje: "${messageData.message.substring(0, 100)}${messageData.message.length > 100 ? '...' : ''}"`);

            let result;

            if (messageData.mediaUrl && messageData.mediaType) {
                // Enviar con media
                const { MessageMedia } = require('whatsapp-web.js');
                const media = MessageMedia.fromFilePath(messageData.mediaUrl);
                result = await client.sendMessage(chatId, media, { caption: messageData.message });
            } else {
                // Enviar mensaje de texto
                result = await client.sendMessage(chatId, messageData.message);
            }

            // Actualizar estadísticas
            sessionData.messagesSent++;
            sessionData.lastActivity = new Date();

            console.log(`✅ Mensaje enviado exitosamente desde ${sessionType.toUpperCase()}`);

            return {
                success: true,
                messageId: result.id._serialized,
                timestamp: new Date(),
                sessionType,
                messageKey
            };

        } catch (error) {
            console.error(`❌ Error enviando mensaje desde ${sessionType}:`, error.message);
            throw error;
        }
    }

    // Reiniciar una sesión específica
    async restartSession(sessionType) {
        console.log(`🔄 Reiniciando sesión ${sessionType.toUpperCase()}...`);

        const sessionData = this.sessions.get(sessionType);
        if (!sessionData) {
            throw new Error(`Sesión ${sessionType} no existe`);
        }

        const { phone, name } = sessionData;

        // Cerrar sesión actual
        await this.closeSession(sessionType);

        // Esperar un poco
        await this.sleep(3000);

        // Crear nueva sesión
        return await this.createSession(sessionType, phone, name);
    }

    // Cerrar una sesión específica
    async closeSession(sessionType) {
        const sessionData = this.sessions.get(sessionType);
        
        if (sessionData) {
            const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';
            console.log(`${sessionIcon} Cerrando sesión ${sessionType.toUpperCase()}: ${sessionData.name}`);
            
            try {
                await sessionData.client.destroy();
                this.sessions.delete(sessionType);
                this.qrCodes.delete(sessionType);
                
                console.log(`✅ Sesión ${sessionType} cerrada`);
            } catch (error) {
                console.error(`❌ Error cerrando sesión ${sessionType}:`, error.message);
            }
        }
    }

    // Obtener QR de una sesión
    getSessionQR(sessionType) {
        return this.qrCodes.get(sessionType);
    }

    // Estado de todas las sesiones
    getAllSessionsStatus() {
        const status = {};
        
        for (const [sessionType, sessionData] of this.sessions) {
            status[sessionType] = {
                type: sessionData.type,
                phone: sessionData.phone,
                name: sessionData.name,
                status: sessionData.status,
                createdAt: sessionData.createdAt,
                connectedAt: sessionData.connectedAt,
                lastActivity: sessionData.lastActivity,
                messagesReceived: sessionData.messagesReceived,
                messagesSent: sessionData.messagesSent,
                clientId: sessionData.clientId
            };
        }
        
        return status;
    }

    // Monitorear salud de las sesiones
    monitorSessions() {
        const now = new Date();
        const maxInactiveTime = 30 * 60 * 1000; // 30 minutos

        for (const [sessionType, sessionData] of this.sessions) {
            const inactiveTime = now - sessionData.lastActivity;
            
            if (inactiveTime > maxInactiveTime && sessionData.status === 'ready') {
                const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';
                console.log(`${sessionIcon} Sesión ${sessionType} inactiva: ${Math.round(inactiveTime / 60000)} min`);
            }
        }
    }

    // Verificar si una sesión está lista
    isSessionReady(sessionType) {
        const sessionData = this.sessions.get(sessionType);
        return sessionData && sessionData.status === 'ready';
    }

    // Obtener información de una sesión
    getSessionInfo(sessionType) {
        const sessionData = this.sessions.get(sessionType);
        if (!sessionData) return null;

        return {
            type: sessionData.type,
            phone: sessionData.phone,
            name: sessionData.name,
            status: sessionData.status,
            createdAt: sessionData.createdAt,
            connectedAt: sessionData.connectedAt,
            lastActivity: sessionData.lastActivity,
            messagesReceived: sessionData.messagesReceived,
            messagesSent: sessionData.messagesSent
        };
    }

    // Cerrar todas las sesiones
    async closeAllSessions() {
        console.log('🛑 Cerrando todas las sesiones...');
        
        const promises = [];
        for (const sessionType of this.sessions.keys()) {
            promises.push(this.closeSession(sessionType));
        }
        
        await Promise.all(promises);
        console.log('✅ Todas las sesiones cerradas');
    }

    // Obtener estadísticas generales
    getStats() {
        const sessions = Array.from(this.sessions.values());
        
        return {
            totalSessions: sessions.length,
            readySessions: sessions.filter(s => s.status === 'ready').length,
            waitingSessions: sessions.filter(s => s.status === 'waiting_qr').length,
            disconnectedSessions: sessions.filter(s => s.status === 'disconnected').length,
            totalMessagesReceived: sessions.reduce((sum, s) => sum + s.messagesReceived, 0),
            totalMessagesSent: sessions.reduce((sum, s) => sum + s.messagesSent, 0),
            sessionsDetails: this.getAllSessionsStatus()
        };
    }

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Limpiar sesiones auth (usar solo en casos extremos)
    async clearAuthSessions() {
        console.log('🧹 Limpiando sesiones de autenticación...');
        console.log('⚠️  ADVERTENCIA: Esto forzará re-escaneo de QR en todos los usuarios');
        
        // Cerrar todas las sesiones activas
        await this.closeAllSessions();
        
        // Directorio por defecto de whatsapp-web.js
        const authPath = path.join(process.cwd(), '.wwebjs_auth');
        
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('✅ Directorio .wwebjs_auth eliminado');
        }
        
        // Limpiar datos en memoria
        this.sessions.clear();
        this.qrCodes.clear();
        
        console.log('✅ Limpieza completa - TODOS los usuarios tendrán que reescanear');
    }

    // Forzar sesión a estado ready (usar cuando se queda en authenticated)
    forceSessionReady(sessionType) {
        const sessionData = this.sessions.get(sessionType);
        
        if (!sessionData) {
            throw new Error(`Sesión ${sessionType} no existe`);
        }

        if (sessionData.status === 'authenticated') {
            console.log(`🔄 Forzando ${sessionType} de 'authenticated' a 'ready'`);
            sessionData.status = 'ready';
            sessionData.connectedAt = new Date();
            this.qrCodes.delete(sessionType);
            
            const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';
            console.log(`✅ ${sessionIcon} ${sessionType.toUpperCase()} FORZADO A READY`);
            
            return true;
        } else {
            console.log(`⚠️ ${sessionType} está en estado '${sessionData.status}', no 'authenticated'`);
            return false;
        }
    }

    // Diagnosticar problemas de sesión
    async diagnoseSessions() {
        console.log('\n🔍 DIAGNÓSTICO DE SESIONES');
        console.log('=========================');
        
        const diagnosis = {
            totalSessions: this.sessions.size,
            sessionDetails: [],
            recommendations: []
        };

        for (const [sessionType, sessionData] of this.sessions) {
            const sessionInfo = {
                type: sessionType,
                status: sessionData.status,
                createdAt: sessionData.createdAt,
                timeInCurrentStatus: Date.now() - sessionData.createdAt.getTime(),
                hasQR: this.qrCodes.has(sessionType),
                issues: []
            };

            // Detectar problemas comunes
            if (sessionData.status === 'initializing' && sessionInfo.timeInCurrentStatus > 60000) {
                sessionInfo.issues.push('Lleva más de 60s en initializing');
                diagnosis.recommendations.push(`${sessionType}: Reiniciar sesión o limpiar archivos auth`);
            }

            if (sessionData.status === 'waiting_qr' && sessionInfo.timeInCurrentStatus > 300000) {
                sessionInfo.issues.push('QR no escaneado en 5+ minutos');
                diagnosis.recommendations.push(`${sessionType}: Escanear QR o regenerar`);
            }

            if (sessionData.status === 'authenticated' && sessionInfo.timeInCurrentStatus > 30000) {
                sessionInfo.issues.push('Authenticated pero no ready después de 30s');
                diagnosis.recommendations.push(`${sessionType}: Forzar estado ready`);
            }

            if (sessionData.status === 'timeout') {
                sessionInfo.issues.push('Sesión con timeout');
                diagnosis.recommendations.push(`${sessionType}: Limpiar archivos auth y reiniciar`);
            }

            diagnosis.sessionDetails.push(sessionInfo);
        }

        console.log('📊 Estado actual:', JSON.stringify(diagnosis, null, 2));
        return diagnosis;
    }

    // Test de conectividad real - enviar mensaje a sí mismo
    async testWhatsAppConnectivity(sessionType) {
        const sessionData = this.sessions.get(sessionType);
        
        if (!sessionData) {
            throw new Error(`Sesión ${sessionType} no existe`);
        }

        if (sessionData.status !== 'ready') {
            throw new Error(`Sesión ${sessionType} no está ready (${sessionData.status})`);
        }

        const { client } = sessionData;
        const sessionIcon = sessionType === 'agent' ? '👤' : '🖥️';

        try {
            console.log(`\n🧪 TESTING CONECTIVIDAD ${sessionType.toUpperCase()}`);
            
            // 1. Verificar estado del cliente
            console.log(`1. Verificando estado del cliente...`);
            const state = await client.getState();
            console.log(`   Estado: ${state}`);

            // 2. Obtener información del usuario
            console.log(`2. Obteniendo información del usuario...`);
            const clientInfo = client.info;
            console.log(`   Info: ${JSON.stringify(clientInfo, null, 2)}`);

            // 3. Intentar obtener chats
            console.log(`3. Obteniendo chats...`);
            const chats = await client.getChats();
            console.log(`   Total chats: ${chats.length}`);

            // 4. Test de mensaje (enviar a sí mismo)
            console.log(`4. Test de envío de mensaje...`);
            const testMessage = `🧪 Test conectividad ${new Date().toISOString()}`;
            const myNumber = client.info.wid._serialized;
            
            try {
                const result = await client.sendMessage(myNumber, testMessage);
                console.log(`✅ Mensaje enviado exitosamente: ${result.id._serialized}`);
                
                return {
                    success: true,
                    sessionType,
                    state,
                    chatsCount: chats.length,
                    testMessageSent: true,
                    testMessageId: result.id._serialized
                };
            } catch (sendError) {
                console.log(`⚠️ No se pudo enviar mensaje de prueba: ${sendError.message}`);
                
                return {
                    success: true,
                    sessionType,
                    state,
                    chatsCount: chats.length,
                    testMessageSent: false,
                    sendError: sendError.message
                };
            }

        } catch (error) {
            console.error(`❌ ${sessionIcon} Error en test de conectividad:`, error.message);
            throw error;
        }
    }
}

module.exports = MultiSessionManager;