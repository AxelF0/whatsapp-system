// servidor/modulo-procesamiento/src/test/testProcessing.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const PROCESSING_URL = `http://localhost:${process.env.PROCESSING_PORT || 3002}`;

async function testProcessingModule() {
    console.log('🧪 Probando Módulo de Procesamiento...\n');

    // 1. Test Health Check
    console.log('1️⃣ Probando Health Check...');
    try {
        const response = await axios.get(`${PROCESSING_URL}/api/health`);
        console.log('✅ Health Check:', response.data.status);
    } catch (error) {
        console.error('❌ Health Check falló:', error.message);
        return;
    }

    console.log('\n2️⃣ Probando análisis de mensajes...\n');

    // 2. Test mensaje de cliente (WhatsApp-Web)
    console.log('📱 Test: Mensaje de cliente a agente...');
    try {
        const clientMessage = {
            messageId: 'test_client_001',
            from: '59170123456@c.us',
            to: '59170999888@c.us',
            body: 'Hola, estoy buscando una casa en la zona norte',
            type: 'text',
            source: 'whatsapp-web',
            timestamp: new Date()
        };

        const response = await axios.post(`${PROCESSING_URL}/api/process/message`, clientMessage);
        console.log('✅ Análisis:', response.data.data.analysis.type);
        console.log('   Descripción:', response.data.data.analysis.description);
        console.log('   Requiere IA:', response.data.data.analysis.requiresIA);

    } catch (error) {
        console.error('❌ Error:', error.response?.data?.error || error.message);
    }

    console.log('\n📞 Test: Comando de agente al sistema...');
    try {
        const systemCommand = {
            messageId: 'test_system_001',
            from: '59170999888', // Número que debe estar en la BD como agente
            to: '59180000000',   // Número del sistema
            body: 'NUEVA PROPIEDAD Casa en Equipetrol 150000 BS 3 dormitorios 2 baños',
            type: 'text',
            source: 'whatsapp-api',
            timestamp: new Date()
        };

        const response = await axios.post(`${PROCESSING_URL}/api/process/message`, systemCommand);
        console.log('✅ Análisis:', response.data.data.analysis.type);
        console.log('   Descripción:', response.data.data.analysis.description);
        console.log('   Requiere Backend:', response.data.data.analysis.requiresBackend);

    } catch (error) {
        console.error('❌ Error:', error.response?.data?.error || error.message);
    }

    console.log('\n🚫 Test: Mensaje de usuario no registrado...');
    try {
        const invalidMessage = {
            messageId: 'test_invalid_001',
            from: '59199999999', // Número no registrado
            to: '59180000000',
            body: 'Hola sistema',
            type: 'text',
            source: 'whatsapp-api',
            timestamp: new Date()
        };

        const response = await axios.post(`${PROCESSING_URL}/api/process/message`, invalidMessage);
        console.log('✅ Análisis:', response.data.data.analysis.type);
        console.log('   Descripción:', response.data.data.analysis.description);

    } catch (error) {
        console.error('❌ Error:', error.response?.data?.error || error.message);
    }

    console.log('\n3️⃣ Probando estadísticas...');
    try {
        const response = await axios.get(`${PROCESSING_URL}/api/stats`);
        console.log('✅ Estadísticas obtenidas:', response.data.data);
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error.message);
    }

    console.log('\n🎉 Pruebas del Módulo de Procesamiento completadas!');
}

// Función para probar diferentes tipos de comandos
async function testCommandParsing() {
    console.log('\n🔧 Probando parsing de comandos...\n');

    const commands = [
        'NUEVA PROPIEDAD Casa en Equipetrol 150000 BS 3 dormitorios 2 baños',
        'NUEVO CLIENTE Juan Perez 70123456 juan@email.com',
        'REGISTRAR AGENTE Maria Lopez 70987654 AGENTE',
        'LISTAR PROPIEDADES ubicacion Equipetrol',
        'AYUDA propiedades'
    ];

    for (const command of commands) {
        console.log(`📋 Comando: "${command}"`);
        try {
            const commandMessage = {
                messageId: `test_cmd_${Date.now()}`,
                from: '59170999888', // Agente registrado
                to: '59180000000',
                body: command,
                type: 'text',
                source: 'whatsapp-api',
                timestamp: new Date()
            };

            const response = await axios.post(`${PROCESSING_URL}/api/process/message`, commandMessage);
            console.log('   ✅ Tipo detectado:', response.data.data.analysis.contentAnalysis?.commandType || 'No detectado');
            console.log('   📤 Procesado:', response.data.data.result.processed ? 'Sí' : 'No');

        } catch (error) {
            console.error('   ❌ Error:', error.response?.data?.error || error.message);
        }
        console.log('');
    }
}

// Ejecutar tests
async function runTests() {
    console.log('🚀 Iniciando pruebas completas del Módulo de Procesamiento\n');
    console.log('⚠️  Asegúrate de que los siguientes servicios estén ejecutándose:');
    console.log('   - Módulo Base de Datos (puerto 3006)');
    console.log('   - Módulo de Procesamiento (puerto 3002)');
    console.log('   - Tener al menos un usuario registrado con teléfono 59170999888\n');

    await testProcessingModule();
    await testCommandParsing();
    
    console.log('\n✨ Todas las pruebas completadas!');
}

// Verificar si este archivo se ejecuta directamente
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = {
    testProcessingModule,
    testCommandParsing,
    runTests
};