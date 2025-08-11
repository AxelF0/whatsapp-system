// servidor/modulo-whatsapp/src/services/sessionManager.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // agentPhone -> sessionData
        this.qrCodes = new Map();  // agentPhone -> qrCode
        this.sessionsDir = path.join(__dirname, '../sessions');
        
        // Crear directorio de sesiones si no existe
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    // Crear nueva sesión para un agente
    async createSession(agentPhone, agentName) {
        console.log(`📱 Creando sesión para ${agentName} (${agentPhone})`);

        if (this.sessions.has(agentPhone)) {
            throw new Error(`Ya existe una sesión para el agente ${agentPhone}`);
        }

        const sessionPath = path.join(this.sessionsDir, `agent_${agentPhone.replace(/[^\d]/g, '')}`);

        // Configuración del cliente (simplificada como tu código de prueba)
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: agentPhone.replace(/[^\d]/g, '')
            }),
            puppeteer: {
                headless: false, // Cambiar a false para debug
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            }
        });

        // Datos de la sesión
        const sessionData = {
            agentPhone,
            agentName,
            client,
            status: 'initializing',
            createdAt: new Date(),
            lastActivity: new Date(),
            messagesReceived: 0,
            messagesSent: 0
        };

        this.sessions.set(agentPhone, sessionData);

        // Configurar eventos del cliente
        this.setupClientEvents(client, agentPhone, agentName);

        // Inicializar cliente
        try {
            await client.initialize();
            console.log(`✅ Cliente inicializado para ${agentName}`);
            
            return {
                agentPhone,
                agentName,
                status: sessionData.status,
                sessionPath
            };

        } catch (error) {
            console.error(`❌ Error inicializando cliente para ${agentName}:`, error.message);
            this.sessions.delete(agentPhone);
            throw error;
        }
    }

    // Configurar eventos del cliente WhatsApp
    setupClientEvents(client, agentPhone, agentName) {
        const sessionData = this.sessions.get(agentPhone);

        // QR Code para conexión
        client.on('qr', (qr) => {
            console.log(`📱 QR generado para ${agentName}:`);
            qrcode.generate(qr, { small: true });
            console.log(`📱 Escanea este código con WhatsApp para conectar ${agentName}`);
            
            // Guardar QR para consulta posterior
            this.qrCodes.set(agentPhone, qr);
            sessionData.status = 'waiting_qr';
            sessionData.qrCode = qr;
        });

        // Cliente listo
        client.on('ready', () => {
            console.log(`✅ ${agentName} conectado y listo!`);
            console.log(`🎉 El agente ${agentName} (${agentPhone}) está ahora conectado a WhatsApp`);
            sessionData.status = 'ready';
            sessionData.connectedAt = new Date();
            
            // Limpiar QR
            this.qrCodes.delete(agentPhone);
        });

        // Mensaje recibido
        client.on('message', async (message) => {
            try {
                // Filtrar mensajes que no necesitamos procesar
                if (message.type === 'e2e_notification') {
                    console.log(`🔐 Mensaje de encriptación ignorado de ${message.from}`);
                    return;
                }

                if (message.type === 'notification_template') {
                    console.log(`📢 Notificación de WhatsApp ignorada de ${message.from}`);
                    return;
                }

                sessionData.messagesReceived++;
                sessionData.lastActivity = new Date();

                console.log(`📨 Mensaje recibido en ${agentName}:`);
                console.log(`   De: ${message.from}`);
                console.log(`   Tipo: ${message.type}`);
                console.log(`   Mensaje: ${message.body ? message.body.substring(0, 100) : '[Sin texto]'}${message.body && message.body.length > 100 ? '...' : ''}`);

                // Solo procesar mensajes con contenido real
                if (!message.body && message.type !== 'image' && message.type !== 'video' && message.type !== 'audio' && message.type !== 'document') {
                    console.log(`⚠️ Mensaje sin contenido procesable, ignorando`);
                    return;
                }

                // Procesar el mensaje
                await this.handleIncomingMessage(message, agentPhone);

            } catch (error) {
                console.error(`❌ Error procesando mensaje en ${agentName}:`, error.message);
            }
        });

        // Desconexión
        client.on('disconnected', (reason) => {
            console.log(`⚠️ ${agentName} desconectado: ${reason}`);
            sessionData.status = 'disconnected';
            sessionData.disconnectedAt = new Date();
        });

        // Error de autenticación
        client.on('auth_failure', (msg) => {
            console.error(`❌ Falla de autenticación en ${agentName}: ${msg}`);
            sessionData.status = 'auth_failed';
            console.log(`💡 Tip: Elimina la carpeta .wwebjs_auth para ${agentName} y vuelve a intentar`);
        });

        // Cargando
        client.on('loading_screen', (percent, message) => {
            console.log(`⏳ ${agentName} cargando... ${percent}% - ${message}`);
        });
    }

    // Manejar mensaje entrante
    async handleIncomingMessage(message, agentPhone) {
        try {
            const MessageHandler = require('./messageHandler');
            const messageHandler = new MessageHandler();

            // Preparar datos del mensaje (como en tu código de prueba)
            const messageData = {
                id: message.id._serialized,
                from: message.from,
                to: agentPhone,
                body: message.body,
                type: message.type || 'chat',
                timestamp: new Date(message.timestamp * 1000),
                agentPhone: agentPhone
            };

            console.log(`📝 Procesando mensaje de ${message.from}: "${message.body}"`);

            // Enviar al handler
            await messageHandler.processMessage(messageData);

        } catch (error) {
            console.error(`❌ Error en handleIncomingMessage:`, error.message);
        }
    }

    // Enviar mensaje desde una sesión
    async sendMessage(agentPhone, messageData) {
        const sessionData = this.sessions.get(agentPhone);
        
        if (!sessionData) {
            throw new Error(`No existe sesión para el agente ${agentPhone}`);
        }

        if (sessionData.status !== 'ready') {
            throw new Error(`Sesión del agente ${agentPhone} no está lista (estado: ${sessionData.status})`);
        }

        const { client } = sessionData;

        try {
            // Formatear número de destino (como en tu código de prueba)
            const cleanNumber = messageData.to.replace(/[^\d]/g, '');
            const chatId = cleanNumber + "@c.us";

            console.log(`📤 Enviando mensaje desde ${sessionData.agentName} a ${chatId}`);
            console.log(`💬 Mensaje: "${messageData.message}"`);

            let result;

            if (messageData.mediaUrl && messageData.mediaType) {
                // Enviar mensaje con media
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

            console.log(`✅ Mensaje enviado exitosamente desde ${sessionData.agentName}`);

            return {
                success: true,
                messageId: result.id._serialized,
                timestamp: new Date()
            };

        } catch (error) {
            console.error(`❌ Error enviando mensaje desde ${sessionData.agentName}:`, error.message);
            throw error;
        }
    }

    // Cerrar sesión
    async closeSession(agentPhone) {
        const sessionData = this.sessions.get(agentPhone);
        
        if (sessionData) {
            console.log(`🛑 Cerrando sesión de ${sessionData.agentName}`);
            
            try {
                await sessionData.client.destroy();
                this.sessions.delete(agentPhone);
                this.qrCodes.delete(agentPhone);
                
                console.log(`✅ Sesión cerrada: ${sessionData.agentName}`);
            } catch (error) {
                console.error(`❌ Error cerrando sesión ${sessionData.agentName}:`, error.message);
            }
        }
    }

    // Obtener QR de una sesión
    getSessionQR(agentPhone) {
        return this.qrCodes.get(agentPhone);
    }

    // Obtener estado de todas las sesiones
    getAllSessionsStatus() {
        const sessions = [];
        
        for (const [agentPhone, sessionData] of this.sessions) {
            sessions.push({
                agentPhone: sessionData.agentPhone,
                agentName: sessionData.agentName,
                status: sessionData.status,
                createdAt: sessionData.createdAt,
                connectedAt: sessionData.connectedAt,
                lastActivity: sessionData.lastActivity,
                messagesReceived: sessionData.messagesReceived,
                messagesSent: sessionData.messagesSent
            });
        }
        
        return sessions;
    }

    // Verificar salud de las sesiones
    checkSessionsHealth() {
        const now = new Date();
        const maxInactiveTime = 30 * 60 * 1000; // 30 minutos

        for (const [agentPhone, sessionData] of this.sessions) {
            const inactiveTime = now - sessionData.lastActivity;
            
            if (inactiveTime > maxInactiveTime && sessionData.status === 'ready') {
                console.log(`⚠️ Sesión inactiva detectada: ${sessionData.agentName} (${Math.round(inactiveTime / 60000)} min)`);
            }
        }
    }

    // Cerrar todas las sesiones
    async closeAllSessions() {
        console.log('🛑 Cerrando todas las sesiones...');
        
        const promises = [];
        for (const agentPhone of this.sessions.keys()) {
            promises.push(this.closeSession(agentPhone));
        }
        
        await Promise.all(promises);
        console.log('✅ Todas las sesiones cerradas');
    }
}

module.exports = SessionManager;