// servidor/modulo-respuestas/src/test/testResponses.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const RESPONSES_URL = `http://localhost:${process.env.RESPONSES_PORT || 3005}`;

async function testResponseModule() {
    console.log('🧪 Probando Módulo de Respuestas...\n');

    try {
        // 1. Test Health Check
        console.log('1️⃣ Probando Health Check...');
        const healthResponse = await axios.get(`${RESPONSES_URL}/api/health`);
        console.log('✅ Estado:', healthResponse.data.status);
        console.log('🔗 Conexiones:', healthResponse.data.connections);

        // 2. Test Plantillas
        console.log('\n2️⃣ Probando Plantillas...');
        const templatesResponse = await axios.get(`${RESPONSES_URL}/api/templates`);
        console.log(`✅ ${templatesResponse.data.data.length} plantillas disponibles`);
        
        // Mostrar algunas plantillas
        console.log('📋 Plantillas cargadas:');
        templatesResponse.data.data.slice(0, 3).forEach(template => {
            console.log(`   - ${template.name} (${template.category})`);
        });

        // 3. Test Renderizar Plantilla
        console.log('\n3️⃣ Probando Renderizado de Plantilla...');
        const renderResponse = await axios.post(`${RESPONSES_URL}/api/templates/render`, {
            templateId: 'welcome_client',
            data: {
                nombre: 'Juan Pérez'
            }
        });
        console.log('✅ Plantilla renderizada:');
        console.log(renderResponse.data.data.content.substring(0, 100) + '...');

        // 4. Test Envío a Cliente (simulado)
        console.log('\n4️⃣ Probando Envío a Cliente...');
        try {
            const clientResponse = await axios.post(`${RESPONSES_URL}/api/send/client`, {
                to: '+59169173077',
                agentPhone: '+59171337051',
                message: 'Hola, gracias por tu consulta sobre propiedades.',
                responseType: 'client'
            });
            console.log('✅ Respuesta enviada a cliente:', clientResponse.data.data);
        } catch (error) {
            console.log('⚠️ Envío a cliente:', error.response?.data?.error || 'WhatsApp no conectado (esperado)');
        }

        // 5. Test Envío de Sistema (simulado)
        console.log('\n5️⃣ Probando Envío del Sistema...');
        const systemResponse = await axios.post(`${RESPONSES_URL}/api/send/system`, {
            to: '+59170000002',
            message: '✅ Propiedad registrada exitosamente\n\nID: PROP001\nUbicación: Equipetrol',
            responseType: 'system'
        });
        console.log('✅ Respuesta del sistema enviada:', systemResponse.data.data);

        // 6. Test Estadísticas
        console.log('\n6️⃣ Probando Estadísticas...');
        const statsResponse = await axios.get(`${RESPONSES_URL}/api/stats`);
        console.log('📊 Estadísticas:', statsResponse.data.data);

        // 7. Test Cola de Mensajes
        console.log('\n7️⃣ Probando Cola de Mensajes...');
        const queueResponse = await axios.get(`${RESPONSES_URL}/api/queue`);
        console.log('📋 Cola:', {
            pendientes: queueResponse.data.data.pending,
            fallidos: queueResponse.data.data.failed
        });

        console.log('\n🎉 ¡Módulo de Respuestas funcionando correctamente!');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Módulo de Respuestas no está corriendo');
            console.error('💡 Ejecuta: npm start en la carpeta del módulo');
        } else {
            console.error('❌ Error:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

// Test de integración completa
async function testCompleteFlow() {
    console.log('\n🔄 Probando Flujo Completo de Respuesta...\n');

    try {
        // 1. Renderizar plantilla de propiedad
        console.log('1️⃣ Preparando información de propiedad...');
        const propertyTemplate = await axios.post(`${RESPONSES_URL}/api/templates/render`, {
            templateId: 'property_info',
            data: {
                nombre_propiedad: 'Casa en Equipetrol',
                ubicacion: 'Equipetrol, 3er Anillo',
                precio: '180,000',
                tamano: '200 m²',
                dormitorios: 3,
                banos: 2,
                descripcion: 'Hermosa casa en zona exclusiva, con jardín y piscina.',
                caracteristicas: '• Piscina\n• Jardín amplio\n• Garaje para 2 autos\n• Seguridad 24/7'
            }
        });
        console.log('✅ Información preparada');

        // 2. Simular envío con plantilla
        console.log('\n2️⃣ Enviando respuesta con plantilla...');
        try {
            const sendResponse = await axios.post(`${RESPONSES_URL}/api/send`, {
                to: '+59169173077',
                agentPhone: '+59171337051',
                templateId: 'property_info',
                templateData: {
                    nombre_propiedad: 'Casa en Equipetrol',
                    ubicacion: 'Equipetrol, 3er Anillo',
                    precio: '180,000',
                    tamano: '200 m²',
                    dormitorios: 3,
                    banos: 2,
                    descripcion: 'Hermosa casa en zona exclusiva.'
                },
                responseType: 'client',
                source: 'ia'
            });
            console.log('✅ Respuesta enviada:', sendResponse.data.data);
        } catch (error) {
            console.log('⚠️ Error esperado (WhatsApp no conectado):', error.response?.data?.error);
        }

        // 3. Simular broadcast
        console.log('\n3️⃣ Probando Broadcast...');
        const broadcastResponse = await axios.post(`${RESPONSES_URL}/api/broadcast`, {
            recipients: [
                { phone: '+59160000001', type: 'client' },
                { phone: '+59160000002', type: 'client' },
                { phone: '+59160000003', type: 'client' }
            ],
            templateId: 'search_results',
            templateData: {
                total: 3,
                propiedades: [
                    {
                        nombre: 'Casa Equipetrol',
                        ubicacion: '3er Anillo',
                        precio: '180,000',
                        dormitorios: 3,
                        banos: 2
                    },
                    {
                        nombre: 'Depto Zona Norte',
                        ubicacion: 'Av. Beni',
                        precio: '95,000',
                        dormitorios: 2,
                        banos: 1
                    }
                ]
            }
        });
        console.log('✅ Broadcast:', {
            total: broadcastResponse.data.data.total,
            enviados: broadcastResponse.data.data.sent,
            fallidos: broadcastResponse.data.data.failed
        });

        console.log('\n✅ Flujo completo probado exitosamente');

    } catch (error) {
        console.error('❌ Error en flujo completo:', error.response?.data || error.message);
    }
}

// Test de plantillas
async function testTemplates() {
    console.log('\n📋 Probando Sistema de Plantillas...\n');

    try {
        // 1. Obtener plantilla específica
        console.log('1️⃣ Obteniendo plantilla específica...');
        const templateResponse = await axios.get(`${RESPONSES_URL}/api/templates/welcome_client`);
        console.log('✅ Plantilla obtenida:', templateResponse.data.data.name);

        // 2. Renderizar diferentes plantillas
        console.log('\n2️⃣ Renderizando múltiples plantillas...');
        
        const templates = [
            {
                id: 'command_success',
                data: {
                    detalles: 'Propiedad PROP001 creada',
                    id: 'PROP001',
                    timestamp: new Date().toLocaleString()
                }
            },
            {
                id: 'new_lead',
                data: {
                    nombre: 'María García',
                    telefono: '+59160000005',
                    interes: 'Casa 3 dormitorios',
                    presupuesto: '150,000 - 200,000 Bs',
                    zona: 'Zona Norte',
                    prioridad: 'Alta'
                }
            }
        ];

        for (const template of templates) {
            const rendered = await axios.post(`${RESPONSES_URL}/api/templates/render`, {
                templateId: template.id,
                data: template.data
            });
            console.log(`✅ ${template.id} renderizada`);
        }

        console.log('\n✅ Sistema de plantillas funcionando correctamente');

    } catch (error) {
        console.error('❌ Error en plantillas:', error.response?.data || error.message);
    }
}

// Ejecutar todas las pruebas
async function runAllTests() {
    console.log('🚀 Iniciando pruebas del Módulo de Respuestas\n');
    console.log('⚠️  Asegúrate de que estén corriendo:');
    console.log('   - Módulo de Respuestas (puerto 3005)');
    console.log('   - Módulo WhatsApp (puerto 3001) - opcional');
    console.log('   - Base de datos (puerto 3006) - opcional\n');

    await testResponseModule();
    await testTemplates();
    await testCompleteFlow();

    console.log('\n✨ ¡Todas las pruebas completadas!');
    console.log('\n📋 Endpoints principales:');
    console.log(`   - GET  ${RESPONSES_URL}/api/health`);
    console.log(`   - POST ${RESPONSES_URL}/api/send`);
    console.log(`   - POST ${RESPONSES_URL}/api/send/client`);
    console.log(`   - POST ${RESPONSES_URL}/api/send/system`);
    console.log(`   - POST ${RESPONSES_URL}/api/broadcast`);
    console.log(`   - GET  ${RESPONSES_URL}/api/templates`);
    console.log(`   - POST ${RESPONSES_URL}/api/templates/render`);
}

// Ejecutar tests
runAllTests().catch(console.error);