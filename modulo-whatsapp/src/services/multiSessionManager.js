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
        
        this.sessionsDir = path.join(__dirname, '../sessions');
        this.createSessionsDirectory();
        
        // Configuración por defecto
        this.config = {
            agent: { phone: null, name: null },
            system: { phone: null, name: null }
        };
        
        // Limpiar cache cada 5 minutos
        setInterval(() => this.cleanMessageCache(), 5 * 60 * 1000);
    }

    // Crear directorio de sesiones
    createSessionsDirectory() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

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
            console.log(`⚠️ Ya existe una sesión ${sessionType}, cerrando...`);
            await this.closeSession(sessionType);
        }

        // Configuración del cliente WhatsApp
        const clientId = `${sessionType}_${phone.replace(/[^\d]/g, '')}`;
        
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: clientId,
                dataPath: this.sessionsDir
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
        client.on('ready', () => {
            console.log(`\n${sessionIcon} ${sessionType.toUpperCase()} CONECTADO: ${name}`);
            console.log(`🎉 La sesión ${sessionType} está ahora activa`);
            
            sessionData.status = 'ready';
            sessionData.connectedAt = new Date();
            this.qrCodes.delete(sessionType);
        });

        // Mensaje recibido
        client.on('message', async (message) => {
            try {
                // Filtrar mensajes del sistema que no necesitamos procesar
                if (this.shouldIgnoreMessage(message)) {
                    return;
                }

                sessionData.messagesReceived++;
                sessionData.lastActivity = new Date();

                console.log(`\n${sessionIcon} Mensaje recibido en ${sessionType.toUpperCase()}:`);
                console.log(`   📞 De: ${message.from}`);
                console.log(`   📝 Tipo: ${message.type}`);
                console.log(`   💬 Contenido: ${this.getMessagePreview(message)}`);

                // Procesar según el tipo de sesión
                await this.handleIncomingMessage(message, sessionType);

            } catch (error) {
                console.error(`❌ Error procesando mensaje en ${sessionType}:`, error.message);
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
        });
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
        if (!this.messageProcessor) {
            console.log('⚠️ No hay procesador de mensajes configurado');
            return;
        }

        const sessionData = this.sessions.get(sessionType);
        
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

        try {
            if (sessionType === 'agent') {
                // Mensajes al AGENTE = consultas de clientes
                console.log(`📨 Procesando consulta de cliente: ${message.from}`);
                await this.messageProcessor.processClientMessage(messageData);
                
            } else if (sessionType === 'system') {
                // Mensajes al SISTEMA = comandos de agentes/gerentes
                console.log(`🔧 Procesando comando del sistema: ${message.from}`);
                await this.messageProcessor.processSystemMessage(messageData);
            }

        } catch (error) {
            console.error(`❌ Error procesando mensaje ${sessionType}:`, error.message);
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

    // Limpiar sesiones auth (útil para desarrollo)
    async clearAuthSessions() {
        console.log('🧹 Limpiando sesiones de autenticación...');
        
        // Cerrar todas las sesiones activas
        await this.closeAllSessions();
        
        // Eliminar archivos de autenticación
        const authPath = path.join(this.sessionsDir, '.wwebjs_auth');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('✅ Archivos de autenticación eliminados');
        }
        
        // Limpiar datos en memoria
        this.sessions.clear();
        this.qrCodes.clear();
        
        console.log('✅ Limpieza completa');
    }
}

module.exports = MultiSessionManager;