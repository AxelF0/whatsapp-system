// servidor/gateway/src/test/debugTest.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const GATEWAY_URL = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;

async function debugGateway() {
    console.log('🔍 Test de Debug para Gateway...\n');

    try {
        // 1. Verificar salud del gateway
        console.log('1️⃣ Verificando salud del Gateway...');
        const healthResponse = await axios.get(`${GATEWAY_URL}/api/health`);
        console.log('✅ Gateway:', healthResponse.data.status);

        // 2. Verificar módulos registrados
        console.log('\n2️⃣ Verificando módulos registrados...');
        const modulesResponse = await axios.get(`${GATEWAY_URL}/api/modules`);
        console.log('📊 Módulos:', Object.keys(modulesResponse.data.data));
        
        // Mostrar estado de cada módulo
        for (const [name, info] of Object.entries(modulesResponse.data.data)) {
            console.log(`   - ${name}: ${info.status} (${info.baseUrl})`);
        }

        // 3. Verificar base de datos específicamente
        console.log('\n3️⃣ Verificando base de datos...');
        try {
            const dbResponse = await axios.get(`${GATEWAY_URL}/api/database/api/health`);
            console.log('✅ Base de datos:', dbResponse.data.status);
        } catch (error) {
            console.log('❌ Base de datos:', error.response?.data?.error || error.message);
        }

        // 4. Probar endpoint de mensajes con datos simulados
        console.log('\n 4️⃣ Probando endpoint de mensajes...');
        const testMessage = {
            messageId: 'test_' + Date.now(),
            from: '59171337051@c.us',
            to: '59170000001@c.us',
            body: 'Mensaje de prueba',
            type: 'text',
            direction: 'incoming',
            source: 'whatsapp-web',
            timestamp: new Date()
        };

        try {
            const messageResponse = await axios.post(`${GATEWAY_URL}/api/whatsapp/message`, testMessage);
            console.log('✅ Mensaje procesado:', messageResponse.data);
        } catch (error) {
            console.log('❌ Error procesando mensaje:');
            console.log('   Status:', error.response?.status);
            console.log('   Data:', error.response?.data);
            console.log('   Message:', error.message);
        }

        // 5. Verificar estado del sistema
        console.log('\n5️⃣ Estado del sistema...');
        try {
            const statusResponse = await axios.get(`${GATEWAY_URL}/api/system/status`);
            console.log('📊 Sistema:', statusResponse.data.data.systemStatus);
            console.log('📊 Módulos saludables:', `${statusResponse.data.data.healthyModules}/${statusResponse.data.data.totalModules}`);
        } catch (error) {
            console.log('⚠️ Error obteniendo estado del sistema:', error.message);
        }

        console.log('\n✅ Debug completado');

    } catch (error) {
        console.error('❌ Error en debug:', error.message);
    }
}

debugGateway();