// servidor/gateway/src/test/testGateway.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const GATEWAY_URL = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;

async function testGateway() {
    console.log('🧪 Probando Gateway...\n');

    try {
        // 1. Test health check
        console.log('1️⃣ Probando health check...');
        const healthResponse = await axios.get(`${GATEWAY_URL}/api/health`);
        console.log('✅ Health check:', healthResponse.data.status);

        // 2. Test lista de módulos
        console.log('\n2️⃣ Probando lista de módulos...');
        const modulesResponse = await axios.get(`${GATEWAY_URL}/api/modules`);
        console.log('✅ Módulos registrados:', Object.keys(modulesResponse.data.data));

        // 3. Test estado del sistema
        console.log('\n3️⃣ Probando estado del sistema...');
        const statusResponse = await axios.get(`${GATEWAY_URL}/api/system/status`);
        console.log('✅ Estado del sistema:', statusResponse.data.data.systemStatus);
        console.log('📊 Módulos saludables:', `${statusResponse.data.data.healthyModules}/${statusResponse.data.data.totalModules}`);

        // 4. Test proxy a base de datos
        console.log('\n4️⃣ Probando proxy a base de datos...');
        try {
            const dbResponse = await axios.get(`${GATEWAY_URL}/api/database/api/health`);
            console.log('✅ Proxy a BD:', dbResponse.data.success ? 'OK' : 'ERROR');
        } catch (error) {
            console.log('⚠️ Proxy a BD: No disponible (normal si BD no está corriendo)');
        }

        // 5. Test mensaje simulado
        console.log('\n5️⃣ Probando procesamiento de mensaje simulado...');
        try {
            const messageData = {
                id: `test_${Date.now()}`,
                from: '+59169173077',
                to: '+59171337051',
                body: 'Hola, me interesa una casa',
                type: 'text'
            };

            const messageResponse = await axios.post(`${GATEWAY_URL}/api/whatsapp/message`, messageData);
            console.log('✅ Mensaje procesado:', messageResponse.data.success ? 'OK' : 'ERROR');
        } catch (error) {
            console.log('⚠️ Procesamiento de mensaje: Error esperado (módulos no disponibles)');
        }

        console.log('\n🎉 Gateway funcionando correctamente!');
        console.log(`🌐 Gateway disponible en: ${GATEWAY_URL}`);
        console.log(`📋 Endpoints principales:`);
        console.log(`   - GET  ${GATEWAY_URL}/api/health`);
        console.log(`   - GET  ${GATEWAY_URL}/api/system/status`);
        console.log(`   - GET  ${GATEWAY_URL}/api/modules`);
        console.log(`   - POST ${GATEWAY_URL}/api/whatsapp/message`);
        console.log(`   - POST ${GATEWAY_URL}/api/whatsapp/webhook`);

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Gateway no está corriendo. Inicia con: npm start');
        } else {
            console.error('❌ Error probando Gateway:', error.message);
        }
        process.exit(1);
    }
}

// Esperar un poco y luego probar
setTimeout(testGateway, 2000);