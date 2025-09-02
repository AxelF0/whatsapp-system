// test-menu-system.js
// Archivo para probar el sistema de menús

const axios = require('axios');

const PROCESSING_URL = 'http://localhost:3002';

async function testMenuSystem() {
    console.log('🧪 Probando Sistema de Menús Interactivos\n');
    
    // Simular mensaje de gerente solicitando menú
    const testMessage = {
        messageId: 'test_menu_001',
        from: '+59169173077', // Número del gerente
        to: '+59171337051',   // Sistema
        body: 'menu',
        type: 'text',
        source: 'whatsapp-api',
        timestamp: new Date()
    };

    try {
        console.log('📤 Enviando solicitud de menú...');
        const response = await axios.post(
            `${PROCESSING_URL}/api/process/message`,
            testMessage
        );

        console.log('✅ Respuesta recibida:');
        console.log(response.data);
        
        if (response.data.data.result.response) {
            console.log('\n📱 MENÚ MOSTRADO:');
            console.log('─────────────────');
            console.log(response.data.data.result.response);
        }

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

// Simular flujo completo
async function testCompleteFlow() {
    console.log('🔄 Probando Flujo Completo\n');
    
    const userId = '+59171337051';
    const commands = [
        { input: 'menu', description: 'Solicitar menú principal' },
        { input: '1', description: 'Seleccionar Gestión de Clientes' },
        { input: '1', description: 'Seleccionar Agregar Cliente' },
        { input: 'Juan Pérez', description: 'Ingresar nombre' },
        { input: '70123456', description: 'Ingresar teléfono' },
        { input: 'juan@email.com', description: 'Ingresar email' },
        { input: 'casa 3 dormitorios', description: 'Ingresar preferencias' }
    ];

    for (const cmd of commands) {
        console.log(`\n➤ ${cmd.description}: "${cmd.input}"`);
        
        const message = {
            messageId: `test_${Date.now()}`,
            from: userId,
            to: '+59171337051',
            body: cmd.input,
            type: 'text',
            source: 'whatsapp-api',
            timestamp: new Date()
        };

        try {
            const response = await axios.post(
                `${PROCESSING_URL}/api/process/message`,
                message
            );
            
            if (response.data.data.result.response) {
                console.log('📱 Respuesta:');
                console.log(response.data.data.result.response);
            }
            
            // Esperar un poco entre comandos
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            break;
        }
    }
}

// Menú de pruebas
async function main() {
    console.log('🎯 SISTEMA DE PRUEBAS - MENÚ INTERACTIVO');
    console.log('=========================================\n');
    console.log('1. Probar menú principal');
    console.log('2. Probar flujo completo de cliente');
    console.log('3. Probar todos los menús');
    console.log('\nEjecutando prueba 1...\n');
    
    await testMenuSystem();
    
    console.log('\n¿Ejecutar flujo completo? (descomenta la línea)');
    await testCompleteFlow();
}

main().catch(console.error);