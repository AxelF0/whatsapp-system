// servidor/modulo-whatsapp/src/test/testMultipleSessions.js

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Configuración de prueba
const TEST_CONFIG = {
    agentPhone: '+59169173077',
    agentName: 'Agente Test RE/MAX',
    systemPhone: '+59171337051', 
    systemName: 'Sistema RE/MAX Test'
};

class MultiSessionTester {
    constructor() {
        this.testResults = [];
        this.startTime = new Date();
    }

    // Ejecutar todas las pruebas
    async runAllTests() {
        console.log('🧪 INICIANDO PRUEBAS DE MÚLTIPLES SESIONES');
        console.log('============================================');
        console.log(`📅 Fecha: ${this.startTime.toISOString()}`);
        console.log(`🔗 URL Base: ${BASE_URL}`);
        console.log('============================================\n');

        try {
            // 1. Verificar que el servidor esté activo
            await this.testServerHealth();

            // 2. Inicializar sesiones
            await this.testInitializeSessions();

            // 3. Verificar estado de sesiones
            await this.testSessionsStatus();

            // 4. Esperar conexión y mostrar QRs
            await this.waitForConnectionsAndShowQRs();

            // 5. Pruebas de mensajería (simuladas)
            await this.testMessageSending();

            // 6. Estadísticas
            await this.testGetStats();

            this.showFinalResults();

        } catch (error) {
            console.error('❌ Error en las pruebas:', error.message);
            this.addTestResult('General', false, error.message);
        }
    }

    // Test 1: Verificar salud del servidor
    async testServerHealth() {
        console.log('📊 Test 1: Verificando salud del servidor...');
        
        try {
            const response = await axios.get(`${BASE_URL}/api/health`, {
                timeout: 5000
            });

            if (response.data.success) {
                console.log('✅ Servidor saludable');
                this.addTestResult('Server Health', true, 'Servidor respondiendo correctamente');
            } else {
                throw new Error('Respuesta de salud inválida');
            }

        } catch (error) {
            console.log('❌ Servidor no disponible');
            this.addTestResult('Server Health', false, error.message);
            throw error;
        }
    }

    // Test 2: Inicializar sesiones
    async testInitializeSessions() {
        console.log('\n📱 Test 2: Inicializando sesiones múltiples...');
        
        try {
            const response = await axios.post(`${BASE_URL}/api/initialize`, TEST_CONFIG, {
                timeout: 30000 // 30 segundos para inicialización
            });

            if (response.data.success) {
                console.log('✅ Sesiones inicializadas correctamente');
                console.log(`   📱 Agente: ${TEST_CONFIG.agentName} (${TEST_CONFIG.agentPhone})`);
                console.log(`   🖥️ Sistema: ${TEST_CONFIG.systemName} (${TEST_CONFIG.systemPhone})`);
                
                this.addTestResult('Initialize Sessions', true, 'Ambas sesiones creadas');
            } else {
                throw new Error(response.data.error || 'Error desconocido');
            }

        } catch (error) {
            console.log('❌ Error inicializando sesiones');
            this.addTestResult('Initialize Sessions', false, error.message);
            throw error;
        }
    }

    // Test 3: Verificar estado de sesiones
    async testSessionsStatus() {
        console.log('\n📋 Test 3: Verificando estado de sesiones...');
        
        try {
            const response = await axios.get(`${BASE_URL}/api/sessions/status`);

            if (response.data.success) {
                const { status } = response.data.data;
                
                console.log('✅ Estado obtenido correctamente:');
                
                // Verificar sesión de agente
                if (status.agent) {
                    console.log(`   👤 Agente: ${status.agent.name} - ${status.agent.status}`);
                } else {
                    throw new Error('Sesión de agente no encontrada');
                }
                
                // Verificar sesión del sistema
                if (status.system) {
                    console.log(`   🖥️ Sistema: ${status.system.name} - ${status.system.status}`);
                } else {
                    throw new Error('Sesión del sistema no encontrada');
                }

                this.addTestResult('Sessions Status', true, 'Estados obtenidos correctamente');
            } else {
                throw new Error('Error obteniendo estado');
            }

        } catch (error) {
            console.log('❌ Error verificando estados');
            this.addTestResult('Sessions Status', false, error.message);
        }
    }

    // Test 4: Mostrar QRs y esperar conexiones
    async waitForConnectionsAndShowQRs() {
        console.log('\n📱 Test 4: Mostrando códigos QR...');
        console.log('=====================================');
        console.log('🔔 ACCIÓN REQUERIDA: Escanea los códigos QR');
        console.log('=====================================');

        try {
            // Obtener QR del agente
            console.log('\n👤 QR AGENTE:');
            await this.showQRCode('agent');

            // Obtener QR del sistema
            console.log('\n🖥️ QR SISTEMA:');
            await this.showQRCode('system');

            console.log('\n⏳ Esperando conexiones...');
            console.log('💡 Escanea ambos códigos QR con los teléfonos correspondientes');
            console.log('📱 Agente: Escanea con', TEST_CONFIG.agentPhone);
            console.log('🖥️ Sistema: Escanea con', TEST_CONFIG.systemPhone);

            // Esperar y monitorear conexiones
            await this.waitForConnections();

            this.addTestResult('QR Display', true, 'QRs mostrados y conexiones establecidas');

        } catch (error) {
            console.log('❌ Error con códigos QR');
            this.addTestResult('QR Display', false, error.message);
        }
    }

    // Mostrar código QR de una sesión
    async showQRCode(sessionType) {
        try {
            const response = await axios.get(`${BASE_URL}/api/sessions/${sessionType}/qr`);
            
            if (response.data.success) {
                console.log(`📱 Código QR para ${sessionType} disponible`);
                console.log(`📋 Instrucción: ${response.data.data.instruction}`);
            } else {
                console.log(`⚠️ QR no disponible para ${sessionType}`);
            }
        } catch (error) {
            console.log(`❌ Error obteniendo QR de ${sessionType}:`, error.message);
        }
    }

    // Esperar a que las conexiones se establezcan
    async waitForConnections(maxWaitTime = 120000) { // 2 minutos max
        const startWait = new Date();
        const checkInterval = 5000; // Verificar cada 5 segundos

        return new Promise((resolve, reject) => {
            const checkConnections = async () => {
                try {
                    const response = await axios.get(`${BASE_URL}/api/sessions/status`);
                    const { status } = response.data.data;

                    const agentReady = status.agent && status.agent.status === 'ready';
                    const systemReady = status.system && status.system.status === 'ready';

                    console.log(`⏳ Estado actual: Agente(${status.agent?.status || 'N/A'}) | Sistema(${status.system?.status || 'N/A'})`);

                    if (agentReady && systemReady) {
                        console.log('🎉 ¡Ambas sesiones conectadas exitosamente!');
                        resolve();
                        return;
                    }

                    const elapsed = new Date() - startWait;
                    if (elapsed > maxWaitTime) {
                        reject(new Error('Timeout esperando conexiones'));
                        return;
                    }

                    // Continuar verificando
                    setTimeout(checkConnections, checkInterval);

                } catch (error) {
                    reject(error);
                }
            };

            // Iniciar verificación
            checkConnections();
        });
    }

    // Test 5: Probar envío de mensajes
    async testMessageSending() {
        console.log('\n📤 Test 5: Probando envío de mensajes...');

        // Test mensaje desde agente
        await this.testAgentMessage();

        // Test mensaje desde sistema
        await this.testSystemMessage();
    }

    // Probar mensaje desde agente
    async testAgentMessage() {
        console.log('\n👤 Probando mensaje desde AGENTE...');
        
        try {
            const messageData = {
                to: '59169173077', // Número de prueba
                message: '🏠 ¡Hola! Soy un agente de RE/MAX. ¿En qué puedo ayudarte con tu búsqueda inmobiliaria?'
            };

            const response = await axios.post(`${BASE_URL}/api/agent/send`, messageData);

            if (response.data.success) {
                console.log('✅ Mensaje del agente enviado correctamente');
                this.addTestResult('Agent Message', true, 'Mensaje enviado desde sesión de agente');
            } else {
                throw new Error(response.data.error);
            }

        } catch (error) {
            console.log('❌ Error enviando mensaje del agente');
            this.addTestResult('Agent Message', false, error.message);
        }
    }

    // Probar mensaje desde sistema
    async testSystemMessage() {
        console.log('\n🖥️ Probando mensaje desde SISTEMA...');
        
        try {
            const messageData = {
                to: TEST_CONFIG.agentPhone.replace('+', ''), // Enviar al agente
                message: '🔧 Mensaje de prueba del SISTEMA:\n\nEste es un comando de prueba para verificar la funcionalidad del sistema.\n\nComandos disponibles:\n- HELP\n- PROPIEDADES\n- CLIENTES\n- STATUS'
            };

            const response = await axios.post(`${BASE_URL}/api/system/send`, messageData);

            if (response.data.success) {
                console.log('✅ Mensaje del sistema enviado correctamente');
                this.addTestResult('System Message', true, 'Mensaje enviado desde sesión del sistema');
            } else {
                throw new Error(response.data.error);
            }

        } catch (error) {
            console.log('❌ Error enviando mensaje del sistema');
            this.addTestResult('System Message', false, error.message);
        }
    }

    // Test 6: Obtener estadísticas
    async testGetStats() {
        console.log('\n📊 Test 6: Obteniendo estadísticas...');
        
        try {
            const response = await axios.get(`${BASE_URL}/api/stats`);

            if (response.data.success) {
                const stats = response.data.data;
                
                console.log('✅ Estadísticas obtenidas:');
                console.log(`   📱 Total sesiones: ${stats.totalSessions}`);
                console.log(`   ✅ Sesiones listas: ${stats.readySessions}`);
                console.log(`   📨 Mensajes recibidos: ${stats.totalMessagesReceived}`);
                console.log(`   📤 Mensajes enviados: ${stats.totalMessagesSent}`);

                this.addTestResult('Get Stats', true, 'Estadísticas obtenidas correctamente');
            } else {
                throw new Error('Error obteniendo estadísticas');
            }

        } catch (error) {
            console.log('❌ Error obteniendo estadísticas');
            this.addTestResult('Get Stats', false, error.message);
        }
    }

    // Agregar resultado de test
    addTestResult(testName, success, details) {
        this.testResults.push({
            test: testName,
            success: success,
            details: details,
            timestamp: new Date()
        });
    }

    // Mostrar resultados finales
    showFinalResults() {
        const endTime = new Date();
        const duration = endTime - this.startTime;
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - successfulTests;

        console.log('\n🎯 RESUMEN DE PRUEBAS');
        console.log('====================');
        console.log(`⏱️ Duración total: ${Math.round(duration / 1000)}s`);
        console.log(`📊 Total pruebas: ${totalTests}`);
        console.log(`✅ Exitosas: ${successfulTests}`);
        console.log(`❌ Fallidas: ${failedTests}`);
        console.log(`📈 Éxito: ${Math.round((successfulTests / totalTests) * 100)}%`);

        console.log('\n📋 DETALLE DE RESULTADOS:');
        console.log('========================');

        this.testResults.forEach((result, index) => {
            const icon = result.success ? '✅' : '❌';
            console.log(`${index + 1}. ${icon} ${result.test}`);
            console.log(`   📝 ${result.details}`);
            console.log(`   🕒 ${result.timestamp.toLocaleTimeString()}`);
            console.log();
        });

        if (failedTests === 0) {
            console.log('🎉 ¡TODAS LAS PRUEBAS EXITOSAS!');
            console.log('✨ El módulo WhatsApp con múltiples sesiones está funcionando correctamente');
        } else {
            console.log('⚠️ Algunas pruebas fallaron. Revisa los detalles arriba.');
        }

        console.log('\n🔧 INSTRUCCIONES POST-PRUEBA:');
        console.log('=============================');
        console.log('1. Mantén las sesiones conectadas para las pruebas reales');
        console.log('2. Envía mensajes a los números para probar la funcionalidad');
        console.log('3. Revisa los logs del servidor para debugging');
        console.log('4. Usa GET /api/sessions/status para monitorear');
        console.log();
    }

    // Ejecutar prueba individual
    async runSingleTest(testName) {
        console.log(`🧪 Ejecutando prueba individual: ${testName}`);
        
        switch (testName) {
            case 'health':
                await this.testServerHealth();
                break;
            case 'initialize':
                await this.testInitializeSessions();
                break;
            case 'status':
                await this.testSessionsStatus();
                break;
            case 'qr':
                await this.waitForConnectionsAndShowQRs();
                break;
            case 'messages':
                await this.testMessageSending();
                break;
            case 'stats':
                await this.testGetStats();
                break;
            default:
                console.log(`❌ Prueba '${testName}' no reconocida`);
                console.log('📋 Pruebas disponibles: health, initialize, status, qr, messages, stats');
        }

        this.showFinalResults();
    }

    // Prueba de estrés (enviar múltiples mensajes)
    async stressTest(messageCount = 10) {
        console.log(`\n🔥 PRUEBA DE ESTRÉS: ${messageCount} mensajes`);
        console.log('====================================');

        const startTime = new Date();
        const results = [];

        for (let i = 1; i <= messageCount; i++) {
            try {
                console.log(`📤 Enviando mensaje ${i}/${messageCount}...`);

                const messageData = {
                    to: '59169173077',
                    message: `🧪 Mensaje de prueba de estrés #${i}\n⏰ Timestamp: ${new Date().toISOString()}\n🔢 Secuencia: ${i}/${messageCount}`
                };

                const response = await axios.post(`${BASE_URL}/api/agent/send`, messageData);

                if (response.data.success) {
                    results.push({ success: true, messageId: i });
                    console.log(`✅ Mensaje ${i} enviado`);
                } else {
                    results.push({ success: false, messageId: i, error: response.data.error });
                    console.log(`❌ Mensaje ${i} falló`);
                }

                // Pequeña pausa entre mensajes
                await this.sleep(1000);

            } catch (error) {
                results.push({ success: false, messageId: i, error: error.message });
                console.log(`❌ Mensaje ${i} error:`, error.message);
            }
        }

        const endTime = new Date();
        const duration = endTime - startTime;
        const successful = results.filter(r => r.success).length;

        console.log('\n📊 RESULTADOS PRUEBA DE ESTRÉS:');
        console.log(`⏱️ Duración: ${Math.round(duration / 1000)}s`);
        console.log(`📨 Total mensajes: ${messageCount}`);
        console.log(`✅ Exitosos: ${successful}`);
        console.log(`❌ Fallidos: ${messageCount - successful}`);
        console.log(`🚀 Velocidad: ${Math.round((successful / (duration / 1000)) * 60)} mensajes/min`);
    }

    // Helper para sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Función principal
async function main() {
    const args = process.argv.slice(2);
    const tester = new MultiSessionTester();

    if (args.length === 0) {
        // Ejecutar todas las pruebas
        await tester.runAllTests();
    } else {
        const command = args[0];
        
        switch (command) {
            case 'stress':
                const count = parseInt(args[1]) || 10;
                await tester.stressTest(count);
                break;
            
            case 'single':
                const testName = args[1];
                if (testName) {
                    await tester.runSingleTest(testName);
                } else {
                    console.log('❌ Especifica el nombre de la prueba');
                    console.log('📋 Uso: node testMultipleSessions.js single <test-name>');
                }
                break;
            
            default:
                console.log('❌ Comando no reconocido');
                console.log('📋 Uso:');
                console.log('   node testMultipleSessions.js           - Todas las pruebas');
                console.log('   node testMultipleSessions.js single <test>  - Prueba individual');
                console.log('   node testMultipleSessions.js stress [count] - Prueba de estrés');
        }
    }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
    console.error('💥 Error no manejado:', error.message);
    process.exit(1);
});

// Ejecutar si es llamado directamente
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Error ejecutando pruebas:', error.message);
        process.exit(1);
    });
}

module.exports = MultiSessionTester;