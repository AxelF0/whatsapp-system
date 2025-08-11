// servidor/modulo-whatsapp/src/test/simpleTest.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const WHATSAPP_URL = `http://localhost:${process.env.WHATSAPP_PORT || 3001}`;

async function simpleTest() {
    console.log('🧪 Prueba Simple del Módulo WhatsApp\n');

    try {
        // 1. Verificar que el módulo esté corriendo
        console.log('1️⃣ Verificando módulo...');
        const healthResponse = await axios.get(`${WHATSAPP_URL}/api/health`);
        console.log('✅ Módulo activo');
        console.log('📊 Estado:', healthResponse.data);

        // 2. Ver sesiones actuales
        console.log('\n2️⃣ Verificando sesiones actuales...');
        const statusResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('📱 Sesiones:', statusResponse.data.data);

        // 3. Crear una sesión simple
        console.log('\n3️⃣ Creando sesión de prueba...');
        const createResponse = await axios.post(`${WHATSAPP_URL}/api/sessions/create`, {
            agentPhone: '+59170000001',
            agentName: 'Agente Prueba'
        });

        if (createResponse.data.success) {
            console.log('✅ Sesión creada exitosamente');
            console.log('📱 Estado:', createResponse.data.data.status);
            
            console.log('\n📱 IMPORTANTE:');
            console.log('- Revisa la consola del servidor WhatsApp');
            console.log('- Deberías ver un código QR');
            console.log('- Escanéalo con WhatsApp para conectar');
            
            // 4. Esperar y verificar estado
            console.log('\n4️⃣ Esperando conexión (30 segundos)...');
            console.log('💡 Mientras tanto, escanea el QR que aparece en la otra terminal');
            
            for (let i = 0; i < 6; i++) {
                await sleep(5000);
                
                const updateResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
                const sessions = updateResponse.data.data.sessions;
                
                if (sessions.length > 0) {
                    const session = sessions[0];
                    console.log(`   [${i*5+5}s] Estado actual: ${session.status}`);
                    
                    if (session.status === 'ready') {
                        console.log('🎉 ¡Agente conectado exitosamente!');
                        break;
                    }
                }
            }
            
        } else {
            console.log('❌ Error creando sesión:', createResponse.data.error);
        }

        // 5. Estado final
        console.log('\n5️⃣ Estado final...');
        const finalResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
        console.log('📊 Sesiones finales:', finalResponse.data.data);

        console.log('\n✅ Prueba completada');
        console.log('\n📋 Próximos pasos:');
        console.log('1. Si ves "ready" - ¡Perfecto! El agente está conectado');
        console.log('2. Envía un mensaje al número del agente para probar');
        console.log('3. El sistema debería procesar el mensaje automáticamente');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Módulo WhatsApp no está corriendo');
            console.error('💡 Ejecuta: npm start en la carpeta del módulo');
        } else if (error.response) {
            console.error('❌ Error del servidor:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

simpleTest();