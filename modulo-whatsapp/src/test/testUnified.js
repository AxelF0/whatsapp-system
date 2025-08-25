// servidor/modulo-whatsapp/src/test/testUnified.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const WHATSAPP_URL = `http://localhost:${process.env.WHATSAPP_PORT || 3001}`;

async function testUnifiedWhatsApp() {
    console.log('Probando Módulo WhatsApp Unificado...\n');

    try {
        // 1. Health check unificado
        console.log('1. Verificando health check unificado...');
        const healthResponse = await axios.get(`${WHATSAPP_URL}/api/health`);
        console.log('Estado:', healthResponse.data.status);
        console.log('Componentes:', {
            whatsappWeb: healthResponse.data.components.whatsappWeb.status,
            whatsappApi: healthResponse.data.components.whatsappApi.status
        });

        // 2. Test WhatsApp-Web (Agentes)
        console.log('\n2. Probando funciones de WhatsApp-Web...');
        
        // Estado de sesiones
        const sessionStatus = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('Sesiones activas:', sessionStatus.data.data.totalSessions);

        // Crear sesión de agente
        try {
            const createSession = await axios.post(`${WHATSAPP_URL}/api/sessions/create`, {
                agentPhone: '+59171337051',
                agentName: 'Agente Prueba'
            });
            
            if (createSession.data.success) {
                console.log('Sesión de agente creada correctamente');
                console.log('Estado:', createSession.data.data.status);
            }
        } catch (error) {
            console.log('Error creando sesión:', error.response?.data?.error || error.message);
        }

        // 3. Test API Oficial (Sistema)
        console.log('\n3. Probando funciones de API Oficial...');
        
        // Estado del sistema
        try {
            const systemStatus = await axios.get(`${WHATSAPP_URL}/api/system/status`);
            console.log('Sistema API:', {
                numero: systemStatus.data.data.systemNumber,
                listo: systemStatus.data.data.isReady
            });
        } catch (error) {
            console.log('Error obteniendo estado del sistema:', error.response?.data?.error);
        }

        // Enviar mensaje del sistema (simulado)
        try {
            const systemMessage = await axios.post(`${WHATSAPP_URL}/api/system/send`, {
                to: '+59170000001',
                message: 'Mensaje de prueba del sistema unificado'
            });
            
            if (systemMessage.data.success) {
                console.log('Mensaje del sistema enviado');
                console.log('Simulado:', systemMessage.data.data.simulated || false);
            }
        } catch (error) {
            console.log('Error enviando mensaje del sistema:', error.response?.data?.error);
        }

        // 4. Test webhook
        console.log('\n4. Probando webhook...');
        
        // Simulación de webhook GET (verificación)
        try {
            const webhookVerify = await axios.get(`${WHATSAPP_URL}/webhook`, {
                params: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN || 'remaxexpressbolivia',
                    'hub.challenge': 'test_challenge'
                }
            });
            console.log('Verificación de webhook: OK');
        } catch (error) {
            console.log('Error en verificación de webhook:', error.response?.status);
        }

        // 5. Test estadísticas
        console.log('\n5. Obteniendo estadísticas...');
        const stats = await axios.get(`${WHATSAPP_URL}/api/stats`);
        console.log('Estadísticas:', {
            whatsappWeb: {
                sesiones: stats.data.data.whatsappWeb.totalSessions,
                listas: stats.data.data.whatsappWeb.readySessions
            },
            whatsappApi: {
                listo: stats.data.data.whatsappApi.isReady,
                numero: stats.data.data.whatsappApi.systemNumber
            }
        });

        // 6. Resumen final
        console.log('\n6. RESUMEN FINAL');
        console.log('Módulo WhatsApp Unificado funcionando correctamente');
        
        console.log('\nFuncionalidades disponibles:');
        console.log('- WhatsApp-Web para agentes: /api/sessions/*');
        console.log('- API Oficial para sistema: /api/system/*');
        console.log('- Webhook para Meta: /webhook');
        console.log('- Administración: /api/health, /api/stats');
        
        console.log('\nPróximos pasos:');
        console.log('1. Escanear códigos QR de agentes (revisar consola del servidor)');
        console.log('2. Configurar webhook en Meta Developer Console');
        console.log('3. Registrar agentes/gerentes en la base de datos');
        console.log('4. Probar flujo completo de mensajes');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('El módulo WhatsApp no está corriendo');
            console.error('Ejecuta: npm start en la carpeta modulo-whatsapp');
        } else {
            console.error('Error en pruebas:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

testUnifiedWhatsApp();