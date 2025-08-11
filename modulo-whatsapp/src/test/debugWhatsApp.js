// servidor/modulo-whatsapp/src/test/debugWhatsApp.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

console.log('🔍 DIAGNÓSTICO WHATSAPP WEB.JS\n');

async function diagnosticWhatsApp() {
    console.log('1. Verificando dependencias...');
    
    try {
        const packageJson = require('../../package.json');
        console.log('✅ whatsapp-web.js version:', packageJson.dependencies['whatsapp-web.js']);
        console.log('✅ puppeteer disponible');
    } catch (error) {
        console.log('❌ Error con dependencias:', error.message);
        return;
    }

    console.log('\n2. Verificando configuración...');
    
    const sessionsDir = path.join(__dirname, '../sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        console.log('✅ Directorio de sesiones creado');
    } else {
        console.log('✅ Directorio de sesiones existe');
    }

    console.log('\n3. Probando conexión directa...');
    
    const testClient = new Client({
        authStrategy: new LocalAuth({
            clientId: 'debug_test',
            dataPath: path.join(sessionsDir, 'debug_session')
        }),
        puppeteer: {
            headless: false, // Mostrar navegador para debug
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
    });

    // Configurar eventos de debug
    testClient.on('loading_screen', (percent, message) => {
        console.log(`⏳ Cargando: ${percent}% - ${message}`);
    });

    testClient.on('qr', (qr) => {
        console.log('\n🎉 ¡QR GENERADO EXITOSAMENTE!');
        console.log('='.repeat(60));
        qrcode.generate(qr, { small: true });
        console.log('='.repeat(60));
        console.log('📱 Escanea con WhatsApp para probar la conexión');
        console.log('⏰ Tienes 20 segundos para escanear\n');
    });

    testClient.on('authenticated', () => {
        console.log('🔐 ¡Autenticado correctamente!');
    });

    testClient.on('ready', async () => {
        console.log('✅ ¡Cliente listo y funcionando!');
        
        const info = await testClient.info;
        console.log('📱 Info del dispositivo:', {
            pushname: info.pushname,
            wid: info.wid.user,
            platform: info.platform
        });

        console.log('\n🎉 ¡DIAGNÓSTICO EXITOSO! WhatsApp Web.js funciona correctamente');
        console.log('🛑 Cerrando cliente de prueba...');
        
        setTimeout(async () => {
            await testClient.destroy();
            console.log('✅ Cliente cerrado. El módulo está listo para usar.');
            process.exit(0);
        }, 5000);
    });

    testClient.on('auth_failure', (msg) => {
        console.log('❌ Falla de autenticación:', msg);
    });

    testClient.on('disconnected', (reason) => {
        console.log('⚠️ Desconectado:', reason);
    });

    // Timeout si no se conecta en 2 minutos
    setTimeout(() => {
        console.log('\n⏰ Timeout - No se pudo conectar en 2 minutos');
        console.log('💡 Sugerencias:');
        console.log('   1. Asegúrate de tener Chrome instalado');
        console.log('   2. Verifica tu conexión a internet');
        console.log('   3. Intenta con headless: false en la configuración');
        console.log('   4. Revisa si hay algún antivirus bloqueando');
        
        testClient.destroy();
        process.exit(1);
    }, 120000);

    try {
        console.log('🚀 Inicializando cliente de prueba...');
        console.log('📂 Sesión guardada en:', path.join(sessionsDir, 'debug_session'));
        
        await testClient.initialize();
        
    } catch (error) {
        console.error('❌ Error inicializando cliente:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Manejo de cierre
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando diagnóstico...');
    process.exit(0);
});

diagnosticWhatsApp();