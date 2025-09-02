// debug-flow.js
const axios = require('axios');

async function debugCompleteFlow() {
    console.log('🔍 DEBUG DEL FLUJO COMPLETO\n');
    console.log('=====================================\n');

    // 1. Verificar WhatsApp
    try {
        console.log('1️⃣ Verificando WhatsApp...');
        const whatsapp = await axios.get('http://localhost:3001/api/sessions/status');
        console.log('✅ WhatsApp:', whatsapp.data.data);
        
        const systemReady = whatsapp.data.data.status?.system?.status === 'ready';
        if (!systemReady) {
            console.log('❌ PROBLEMA: Sesión del sistema no está ready');
            return;
        }
    } catch (error) {
        console.log('❌ WhatsApp no responde:', error.message);
        return;
    }

    // 2. Verificar Gateway
    try {
        console.log('\n2️⃣ Verificando Gateway...');
        const gateway = await axios.get('http://localhost:3000/api/health');
        console.log('✅ Gateway activo');
    } catch (error) {
        console.log('❌ Gateway no responde:', error.message);
    }

    // 3. Verificar Procesamiento
    try {
        console.log('\n3️⃣ Verificando Procesamiento...');
        const processing = await axios.get('http://localhost:3002/api/health');
        console.log('✅ Procesamiento activo');
    } catch (error) {
        console.log('❌ Procesamiento no responde:', error.message);
        return;
    }

    // 4. Verificar Backend
    try {
        console.log('\n4️⃣ Verificando Backend...');
        const backend = await axios.get('http://localhost:3004/api/health');
        console.log('✅ Backend activo');
    } catch (error) {
        console.log('❌ Backend no responde:', error.message);
    }

    // 5. Verificar Respuestas
    try {
        console.log('\n5️⃣ Verificando Respuestas...');
        const responses = await axios.get('http://localhost:3005/api/health');
        console.log('✅ Respuestas activo');
    } catch (error) {
        console.log('❌ Respuestas no responde:', error.message);
    }

    // 6. Verificar Base de Datos y tu usuario
    try {
        console.log('\n6️⃣ Verificando tu usuario en BD...');
        const users = await axios.get('http://localhost:3006/api/users');
        console.log('Usuarios encontrados:', users.data.data.length);
        
        // Buscar gerentes
        const gerentes = users.data.data.filter(u => u.cargo_id === 2);
        console.log('Gerentes:', gerentes.map(g => ({
            nombre: g.nombre,
            telefono: g.telefono,
            estado: g.estado
        })));
    } catch (error) {
        console.log('❌ BD no responde:', error.message);
    }

    console.log('\n=====================================');
    console.log('🏁 Debug completado\n');
}

// Simular envío de mensaje
async function testDirectMessage(phoneFrom) {
    console.log('\n📤 PROBANDO ENVÍO DIRECTO AL PROCESAMIENTO\n');
    
    const testMessage = {
        messageId: `debug_${Date.now()}`,
        from: phoneFrom || '+59171337051',
        to: '+59171337051',
        body: 'menu',
        type: 'text',
        source: 'whatsapp-api',
        timestamp: new Date(),
        direction: 'incoming',
        processed: false,
        response_sent: false
    };

    try {
        console.log('Enviando mensaje de prueba...');
        const response = await axios.post(
            'http://localhost:3002/api/process/message',
            testMessage
        );
        
        console.log('✅ Respuesta del procesamiento:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ Error:', error.response?.data || error.message);
    }
}

// Ejecutar debug
async function main() {
    await debugCompleteFlow();
    
    // Pregunta: ¿cuál es tu número de teléfono registrado?
    console.log('\n💡 Ahora prueba con tu número real.');
    console.log('Modifica el número en testDirectMessage() y descomenta la línea:');
    console.log('// await testDirectMessage("+591TU_NUMERO");');
    
    // Descomenta y pon tu número real:
    await testDirectMessage("+59169173077");
}

main().catch(console.error);