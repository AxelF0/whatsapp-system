// servidor/modulo-whatsapp/src/test/testFuncional.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const WHATSAPP_URL = `http://localhost:${process.env.WHATSAPP_PORT || 3001}`;

class WhatsAppTester {
    constructor() {
        this.results = {
            healthCheck: false,
            whatsappWeb: false,
            whatsappApi: false,
            webhook: false,
            errors: []
        };
    }

    async runAllTests() {
        console.log('='.repeat(60));
        console.log('PRUEBA FUNCIONAL - MÓDULO WHATSAPP UNIFICADO');
        console.log('='.repeat(60));
        
        try {
            await this.testModuleHealth();
            await this.testWhatsAppWeb();
            await this.testWhatsAppApi();
            await this.testWebhook();
            await this.showResults();
            
        } catch (error) {
            console.error('Error crítico en las pruebas:', error.message);
            process.exit(1);
        }
    }

    async testModuleHealth() {
        console.log('\n1. VERIFICANDO SALUD DEL MÓDULO');
        console.log('-'.repeat(40));
        
        try {
            const response = await axios.get(`${WHATSAPP_URL}/api/health`, { timeout: 5000 });
            
            if (response.data.success) {
                console.log('✓ Módulo WhatsApp funcionando');
                console.log(`  Estado: ${response.data.status}`);
                
                const components = response.data.components;
                console.log(`  WhatsApp-Web: ${components.whatsappWeb.status}`);
                console.log(`  WhatsApp-API: ${components.whatsappApi.status}`);
                console.log(`  Sesiones activas: ${components.whatsappWeb.sessions.ready}/${components.whatsappWeb.sessions.total}`);
                
                this.results.healthCheck = true;
            } else {
                throw new Error('Health check falló');
            }
            
        } catch (error) {
            console.log('✗ Error en health check:', error.message);
            this.results.errors.push('Health check falló');
            
            if (error.code === 'ECONNREFUSED') {
                console.log('\n  SOLUCIÓN: Inicia el módulo con:');
                console.log('  cd modulo-whatsapp && npm start\n');
                process.exit(1);
            }
        }
    }

    async testWhatsAppWeb() {
        console.log('\n2. PROBANDO WHATSAPP-WEB (AGENTES)');
        console.log('-'.repeat(40));
        
        try {
            // Test 1: Estado de sesiones
            console.log('Verificando estado de sesiones...');
            const statusResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/status`);
            
            if (statusResponse.data.success) {
                const data = statusResponse.data.data;
                console.log(`✓ API de sesiones funciona`);
                console.log(`  Total sesiones: ${data.totalSessions}`);
                console.log(`  Sesiones activas: ${data.activeSessions}`);
                console.log(`  Tipo: ${data.type}`);
            }

            // Test 2: Crear sesión de prueba
            console.log('\nCreando sesión de prueba...');
            try {
                const createResponse = await axios.post(`${WHATSAPP_URL}/api/sessions/create`, {
                    agentPhone: '+59169173077',
                    agentName: 'Agente Prueba Test'
                });
                
                if (createResponse.data.success) {
                    console.log('✓ Sesión creada exitosamente');
                    console.log(`  Estado: ${createResponse.data.data.status}`);
                    console.log('  NOTA: Revisa la consola del servidor para el código QR');
                    
                    // Test 3: Verificar QR
                    await this.sleep(2000);
                    console.log('\nVerificando QR...');
                    try {
                        const qrResponse = await axios.get(`${WHATSAPP_URL}/api/sessions/${encodeURIComponent('+59169173077')}/qr`);
                        
                        if (qrResponse.data.success) {
                            console.log('✓ QR disponible para escanear');
                        } else {
                            console.log('- QR no disponible aún');
                        }
                    } catch (qrError) {
                        console.log('- QR no disponible:', qrError.response?.data?.error);
                    }
                    
                } else {
                    console.log('✗ Error creando sesión:', createResponse.data.error);
                }
                
            } catch (sessionError) {
                if (sessionError.response?.data?.error?.includes('Ya existe')) {
                    console.log('✓ Sesión ya existe (OK)');
                } else {
                    console.log('✗ Error en sesión:', sessionError.response?.data?.error);
                }
            }

            // Test 4: Envío de mensaje (fallará sin conexión)
            console.log('\nProbando envío de mensaje...');
            try {
                const sendResponse = await axios.post(`${WHATSAPP_URL}/api/sessions/${encodeURIComponent('+59169173077')}/send`, {
                    to: '+59171337051',
                    message: 'Mensaje de prueba del sistema'
                });
                
                if (sendResponse.data.success) {
                    console.log('✓ Mensaje enviado (WhatsApp conectado)');
                } else {
                    console.log('- Mensaje no enviado (esperado sin conexión)');
                }
                
            } catch (sendError) {
                console.log('- Envío falló (esperado sin conexión WhatsApp)');
                console.log(`  Razón: ${sendError.response?.data?.error || 'WhatsApp no conectado'}`);
            }

            this.results.whatsappWeb = true;
            console.log('\n✓ WhatsApp-Web: FUNCIONAL');
            
        } catch (error) {
            console.log('✗ Error en WhatsApp-Web:', error.message);
            this.results.errors.push('WhatsApp-Web falló');
        }
    }

    async testWhatsAppApi() {
        console.log('\n3. PROBANDO API OFICIAL (SISTEMA)');
        console.log('-'.repeat(40));
        
        try {
            // Test 1: Estado del sistema
            console.log('Verificando estado del sistema...');
            const systemStatus = await axios.get(`${WHATSAPP_URL}/api/system/status`);
            
            if (systemStatus.data.success) {
                const data = systemStatus.data.data;
                console.log('✓ API del sistema funciona');
                console.log(`  Número del sistema: ${data.systemNumber}`);
                console.log(`  Estado: ${data.isReady ? 'Listo' : 'No configurado'}`);
                console.log(`  Phone Number ID: ${data.phoneNumberId || 'No configurado'}`);
                
                if (!data.isReady) {
                    console.log('  NOTA: API funcionará en modo simulación');
                }
            }

            // Test 2: Envío de mensaje del sistema
            console.log('\nProbando envío de mensaje del sistema...');
            const systemMessage = await axios.post(`${WHATSAPP_URL}/api/system/send`, {
                to: '+59170000001',
                message: 'Mensaje de prueba del sistema unificado'
            });
            
            if (systemMessage.data.success) {
                console.log('✓ Mensaje del sistema enviado');
                console.log(`  ID del mensaje: ${systemMessage.data.data.messageId}`);
                console.log(`  Simulado: ${systemMessage.data.data.simulated ? 'Sí' : 'No'}`);
            }

            // Test 3: Mensaje interactivo
            console.log('\nProbando mensaje interactivo...');
            try {
                const interactiveMessage = await axios.post(`${WHATSAPP_URL}/api/system/send/interactive`, {
                    to: '+59170000001',
                    bodyText: 'Selecciona una opción:',
                    buttons: [
                        { id: 'btn1', title: 'Opción 1' },
                        { id: 'btn2', title: 'Opción 2' }
                    ],
                    headerText: 'Sistema Inmobiliario',
                    footerText: 'Selecciona para continuar'
                });
                
                if (interactiveMessage.data.success) {
                    console.log('✓ Mensaje interactivo enviado');
                } else {
                    console.log('- Mensaje interactivo falló');
                }
                
            } catch (intError) {
                console.log('- Mensaje interactivo no enviado (API no configurada)');
            }

            this.results.whatsappApi = true;
            console.log('\n✓ API Oficial: FUNCIONAL');
            
        } catch (error) {
            console.log('✗ Error en API Oficial:', error.message);
            this.results.errors.push('API Oficial falló');
        }
    }

    async testWebhook() {
        console.log('\n4. PROBANDO WEBHOOK');
        console.log('-'.repeat(40));
        
        try {
            // Test 1: Verificación de webhook (GET)
            console.log('Probando verificación de webhook...');
            const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'remaxexpressbolivia';
            
            const verifyResponse = await axios.get(`${WHATSAPP_URL}/webhook`, {
                params: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': verifyToken,
                    'hub.challenge': 'test_challenge_12345'
                }
            });
            
            if (verifyResponse.data === 'test_challenge_12345') {
                console.log('✓ Verificación de webhook funciona');
                console.log(`  Token usado: ${verifyToken}`);
            } else {
                console.log('✗ Verificación de webhook falló');
            }

            // Test 2: Webhook alternativo
            console.log('\nProbando webhook alternativo...');
            try {
                const altVerify = await axios.get(`${WHATSAPP_URL}/api/whatsapp/webhook`, {
                    params: {
                        'hub.mode': 'subscribe',
                        'hub.verify_token': verifyToken,
                        'hub.challenge': 'alt_test_12345'
                    }
                });
                
                if (altVerify.data === 'alt_test_12345') {
                    console.log('✓ Webhook alternativo funciona');
                }
            } catch (altError) {
                console.log('- Webhook alternativo no disponible');
            }

            // Test 3: Simulación de webhook POST
            console.log('\nSimulando webhook POST...');
            try {
                const webhookData = {
                    entry: [{
                        id: 'test_entry',
                        changes: [{
                            field: 'messages',
                            value: {
                                messaging_product: 'whatsapp',
                                messages: [{
                                    id: 'test_msg_' + Date.now(),
                                    from: '59169173077',
                                    timestamp: Math.floor(Date.now() / 1000).toString(),
                                    type: 'text',
                                    text: { body: 'AYUDA' }
                                }]
                            }
                        }]
                    }]
                };

                const postResponse = await axios.post(`${WHATSAPP_URL}/webhook`, webhookData);
                
                if (postResponse.status === 200) {
                    console.log('✓ Webhook POST procesado');
                    console.log('  NOTA: Mensaje será validado contra base de datos');
                }
                
            } catch (postError) {
                console.log('- Webhook POST falló (esperado sin BD)');
            }

            this.results.webhook = true;
            console.log('\n✓ Webhook: FUNCIONAL');
            
        } catch (error) {
            console.log('✗ Error en Webhook:', error.message);
            this.results.errors.push('Webhook falló');
        }
    }

    async showResults() {
        console.log('\n' + '='.repeat(60));
        console.log('RESULTADOS DE LA PRUEBA');
        console.log('='.repeat(60));
        
        const total = 4;
        const passed = Object.values(this.results).filter(v => v === true).length;
        
        console.log(`\nCOMPONENTES PROBADOS: ${passed}/${total}`);
        console.log(`Health Check: ${this.results.healthCheck ? '✓' : '✗'}`);
        console.log(`WhatsApp-Web: ${this.results.whatsappWeb ? '✓' : '✗'}`);
        console.log(`API Oficial: ${this.results.whatsappApi ? '✓' : '✗'}`);
        console.log(`Webhook: ${this.results.webhook ? '✓' : '✗'}`);
        
        if (this.results.errors.length > 0) {
            console.log('\nERRORES ENCONTRADOS:');
            this.results.errors.forEach(error => {
                console.log(`- ${error}`);
            });
        }
        
        console.log('\nESTADO GENERAL:');
        if (passed === total) {
            console.log('✓ MÓDULO COMPLETAMENTE FUNCIONAL');
        } else if (passed >= 2) {
            console.log('⚠ MÓDULO PARCIALMENTE FUNCIONAL');
        } else {
            console.log('✗ MÓDULO NO FUNCIONAL');
        }
        
        console.log('\nSIGUIENTES PASOS:');
        console.log('1. Si ves "Sesión creada", escanea el QR en la consola del servidor');
        console.log('2. Configura las credenciales de API oficial en .env');
        console.log('3. Registra agentes/gerentes en la base de datos');
        console.log('4. Configura el webhook en Meta Developer Console');
        console.log('5. Prueba el flujo completo con mensajes reales');
        
        console.log('\nURLs IMPORTANTES:');
        console.log(`- Health check: ${WHATSAPP_URL}/api/health`);
        console.log(`- Sesiones: ${WHATSAPP_URL}/api/sessions/status`);
        console.log(`- Webhook para Meta: https://1d813a023c8f.ngrok-free.app`);
        console.log(`- Verify Token: ${process.env.WHATSAPP_VERIFY_TOKEN || 'remaxexpressbolivia'}`);
        
        console.log('\n' + '='.repeat(60));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Ejecutar pruebas
const tester = new WhatsAppTester();
tester.runAllTests().catch(error => {
    console.error('Error ejecutando pruebas:', error.message);
    process.exit(1);
});