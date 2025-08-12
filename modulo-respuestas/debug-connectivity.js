// debug-connectivity.js
// Ejecuta este script para verificar qué módulos están realmente corriendo

const axios = require('axios');

const modules = [
    { name: 'Gateway', url: 'http://localhost:3000/api/health' },
    { name: 'WhatsApp', url: 'http://localhost:3001/api/health' },
    { name: 'Procesamiento', url: 'http://localhost:3002/api/health' },
    { name: 'IA', url: 'http://localhost:3003/api/health' },
    { name: 'Backend', url: 'http://localhost:3004/api/health' },
    { name: 'Respuestas', url: 'http://localhost:3005/api/health' },
    { name: 'Base de Datos', url: 'http://localhost:3006/api/health' }
];

async function checkAllModules() {
    console.log('🔍 Verificando conectividad de todos los módulos...\n');
    
    for (const module of modules) {
        try {
            const response = await axios.get(module.url, { timeout: 2000 });
            
            if (response.data.success || response.data.status) {
                console.log(`✅ ${module.name.padEnd(15)} - ONLINE en ${module.url}`);
                
                // Mostrar detalles adicionales si están disponibles
                if (response.data.service) {
                    console.log(`   Servicio: ${response.data.service}`);
                }
                if (response.data.sessions) {
                    console.log(`   Sesiones: ${JSON.stringify(response.data.sessions)}`);
                }
            } else {
                console.log(`⚠️  ${module.name.padEnd(15)} - Respuesta inesperada`);
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.log(`❌ ${module.name.padEnd(15)} - NO ESTÁ CORRIENDO (puerto ${module.url.match(/:\d+/)[0]})`);
            } else if (error.code === 'ETIMEDOUT') {
                console.log(`⏱️  ${module.name.padEnd(15)} - TIMEOUT`);
            } else {
                console.log(`❌ ${module.name.padEnd(15)} - ERROR: ${error.message}`);
            }
        }
        console.log('');
    }
    
    console.log('\n📊 Resumen de conectividad completado');
}

// También verificar las conexiones cruzadas
async function checkCrossConnections() {
    console.log('\n🔗 Verificando conexiones cruzadas...\n');
    
    // Verificar que Respuestas puede ver WhatsApp y Gateway
    try {
        console.log('Desde Respuestas (3005):');
        const respHealth = await axios.get('http://localhost:3005/api/health');
        console.log('  Conexiones:', respHealth.data.connections);
    } catch (error) {
        console.log('  Error obteniendo estado de Respuestas');
    }
    
    // Verificar que Backend puede ver BD y Respuestas
    try {
        console.log('\nDesde Backend (3004):');
        const backHealth = await axios.get('http://localhost:3004/api/health');
        console.log('  Conexiones:', backHealth.data.connections);
    } catch (error) {
        console.log('  Error obteniendo estado de Backend');
    }
}

async function main() {
    await checkAllModules();
    await checkCrossConnections();
}

main().catch(console.error);