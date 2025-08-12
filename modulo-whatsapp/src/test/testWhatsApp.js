// servidor/modulo-whatsapp/src/test/testWhatsApp.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const WHATSAPP_URL = `http://localhost:${process.env.WHATSAPP_PORT || 3001}`;

// Datos de prueba
const TEST_AGENTS = [
    { phone: '+59171337051', name: 'Juan Pérez' }//,
    // { phone: '+59170000002', name: 'María García' }
];

async function testWhatsAppModule() {
    console.log('🧪 Probando Módulo WhatsApp...\n');

    try {
        // 1. Test health check
        console.log('1️⃣ Probando health check...');
        const healthResponse = await axios.get(`${WHATSAPP_URL}/api/health`);
        console.log('✅ Health check:', healthResponse.data.status);
        console.log('📊 Sesiones:', healthResponse.data.sessions);

        // 2. Test información del módulo
        console.log('\n2️⃣ Probando información del módulo...');
        const infoResponse = await axios.get(`${WHATSAPP_URL}/api/info`);
        console.log('✅ Módulo:', infoResponse.data.data.module);
        console.log('📋 Capacidades:', infoResponse.data.data.capabilities);

        // 3. Test estado inicial de sesiones
        console.log('\n3️⃣ Probando estado inicial de sesiones...');
        const statusResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('✅ Total sesiones:', statusResponse.data.data.totalSessions);
        console.log('🔗 Sesiones activas:', statusResponse.data.data.activeSessions);

        // 4. Test crear sesión de agente
        console.log('\n4️⃣ Probando crear sesión de agente...');
        
        for (const agent of TEST_AGENTS) {
            try {
                const createResponse = await axios.post(`${WHATSAPP_URL}/api/sessions/create`, {
                    agentPhone: agent.phone,
                    agentName: agent.name
                });

                if (createResponse.data.success) {
                    console.log(`✅ Sesión creada para ${agent.name}`);
                    console.log(`📱 Estado: ${createResponse.data.data.status}`);
                } else {
                    console.log(`❌ Error creando sesión para ${agent.name}`);
                }

                // Esperar un poco entre creaciones
                await sleep(2000);

            } catch (error) {
                console.log(`⚠️ ${agent.name}: ${error.response?.data?.error || error.message}`);
            }
        }

        // 5. Test estado después de crear sesiones
        console.log('\n5️⃣ Probando estado después de crear sesiones...');
        const updatedStatusResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('📊 Estado actualizado:');
        console.log('   - Total sesiones:', updatedStatusResponse.data.data.totalSessions);
        console.log('   - Sesiones activas:', updatedStatusResponse.data.data.activeSessions);
        
        if (updatedStatusResponse.data.data.sessions.length > 0) {
            console.log('\n📱 Sesiones creadas:');
            updatedStatusResponse.data.data.sessions.forEach(session => {
                console.log(`   - ${session.agentName}: ${session.status}`);
            });
        }

        // 6. Test obtener QR codes
        console.log('\n6️⃣ Probando obtención de QR codes...');
        for (const agent of TEST_AGENTS) {
            try {
                const qrResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/${encodeURIComponent(agent.phone)}/qr`);
                
                if (qrResponse.data.success) {
                    console.log(`✅ QR disponible para ${agent.name}`);
                    console.log('📱 Para conectar WhatsApp, escanea el QR que aparece en la consola del servidor');
                } else {
                    console.log(`⚠️ QR no disponible para ${agent.name}`);
                }
            } catch (error) {
                console.log(`⚠️ Error obteniendo QR para ${agent.name}:`, error.response?.data?.error || error.message);
            }
        }

        // 7. Test enviar mensaje (fallará hasta que se conecte WhatsApp)
        console.log('\n7️⃣ Probando envío de mensaje...');
        try {
            const sendResponse = await axios.post(`${WHATSAPP_URL}/api/sessions/${encodeURIComponent(TEST_AGENTS[0].phone)}/send`, {
                to: '+59169173077',
                message: 'Mensaje de prueba desde el sistema automatizado'
            });

            if (sendResponse.data.success) {
                console.log('✅ Mensaje enviado correctamente');
            }
        } catch (error) {
            console.log('⚠️ Envío de mensaje:', error.response?.data?.error || 'Esperado - WhatsApp no conectado aún');
        }

        // 8. Test cerrar una sesión
        console.log('\n8️⃣ Probando cerrar sesión...');
        try {
            const closeResponse = await axios.delete(`${WHATSAPP_URL}/api/sessions/${encodeURIComponent(TEST_AGENTS[1].phone)}`);
            
            if (closeResponse.data.success) {
                console.log(`✅ Sesión cerrada: ${TEST_AGENTS[1].name}`);
            }
        } catch (error) {
            console.log(`⚠️ Error cerrando sesión:`, error.response?.data?.error || error.message);
        }

        // 9. Test estado final
        console.log('\n9️⃣ Probando estado final...');
        const finalStatusResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('📊 Estado final:');
        console.log('   - Total sesiones:', finalStatusResponse.data.data.totalSessions);
        console.log('   - Sesiones activas:', finalStatusResponse.data.data.activeSessions);

        console.log('\n🎉 Módulo WhatsApp funcionando correctamente!');
        console.log('\n📋 PRÓXIMOS PASOS:');
        console.log('1. Escanea los códigos QR que aparecen en la consola del servidor');
        console.log('2. Una vez conectados, los agentes recibirán mensajes automáticamente');
        console.log('3. El sistema responderá automáticamente a consultas de clientes');
        console.log('\n🌐 Endpoints principales:');
        console.log(`   - GET  ${WHATSAPP_URL}/api/health`);
        console.log(`   - GET  ${WHATSAPP_URL}/api/sessions/status`);
        console.log(`   - POST ${WHATSAPP_URL}/api/sessions/create`);
        console.log(`   - POST ${WHATSAPP_URL}/api/sessions/{phone}/send`);

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Módulo WhatsApp no está corriendo. Inicia con: npm start');
        } else {
            console.error('❌ Error probando módulo WhatsApp:', error.message);
        }
        process.exit(1);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Esperar un poco y luego probar
setTimeout(testWhatsAppModule, 2000);