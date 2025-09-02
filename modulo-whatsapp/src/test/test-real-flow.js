// test-real-flow.js
const axios = require('axios');

async function sendTestMessage() {
    const TU_NUMERO = '+591XXXXXXXX'; // PON TU NÚMERO REAL AQUÍ
    
    console.log('📤 Enviando mensaje de prueba como si fuera de WhatsApp...\n');
    
    // 1. Primero al Gateway (como lo haría WhatsApp)
    try {
        const gatewayMessage = {
            from: TU_NUMERO,
            to: '+59180000000',
            body: 'menu',
            type: 'chat',
            source: 'whatsapp-web',
            timestamp: new Date()
        };

        console.log('1️⃣ Enviando al Gateway...');
        const response = await axios.post(
            'http://localhost:3000/api/whatsapp/message',
            gatewayMessage
        );
        
        console.log('✅ Gateway respondió:', response.data);
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

sendTestMessage();