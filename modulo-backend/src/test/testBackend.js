// servidor/modulo-backend/src/test/testBackend.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const BACKEND_URL = `http://localhost:${process.env.BACKEND_PORT || 3004}`;

async function testBackendModule() {
    console.log('🧪 Probando Módulo Backend...\n');

    try {
        // 1. Test Health Check
        console.log('1️⃣ Probando Health Check...');
        const healthResponse = await axios.get(`${BACKEND_URL}/api/health`);
        console.log('✅ Estado:', healthResponse.data.status);
        console.log('🔗 Conexiones:', healthResponse.data.connections);

        // 2. Test Comandos Disponibles
        console.log('\n2️⃣ Probando Comandos Disponibles...');
        const commandsResponse = await axios.get(`${BACKEND_URL}/api/commands/help`);
        console.log(`✅ ${commandsResponse.data.data.length} comandos disponibles`);
        
        console.log('📋 Algunos comandos:');
        commandsResponse.data.data.slice(0, 5).forEach(cmd => {
            console.log(`   - ${cmd.name}: ${cmd.format}`);
        });

        // 3. Test Validación de Comando
        console.log('\n3️⃣ Probando Validación de Comando...');
        const validationResponse = await axios.post(`${BACKEND_URL}/api/commands/validate`, {
            command: { type: 'create_property' },
            user: { role: 'agente' }
        });
        console.log('✅ Validación:', validationResponse.data.data.valid ? 'Válido' : 'Inválido');

        // 4. Test Estadísticas
        console.log('\n4️⃣ Probando Estadísticas...');
        const statsResponse = await axios.get(`${BACKEND_URL}/api/stats`);
        console.log('📊 Estadísticas del sistema:', statsResponse.data.data);

        console.log('\n🎉 ¡Módulo Backend funcionando correctamente!');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Módulo Backend no está corriendo');
            console.error('💡 Ejecuta: npm start en la carpeta del módulo');
        } else {
            console.error('❌ Error:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

// Test de procesamiento de comandos
async function testCommandProcessing() {
    console.log('\n⚙️ Probando Procesamiento de Comandos...\n');

    const testCommands = [
        {
            name: 'Crear Propiedad',
            data: {
                command: {
                    type: 'create_property',
                    originalMessage: 'NUEVA PROPIEDAD Casa en Equipetrol 150000 3 dormitorios 2 baños',
                    parameters: {
                        propertyData: {
                            nombre_propiedad: 'Casa en Equipetrol',
                            ubicacion: 'Equipetrol',
                            precio: 150000,
                            dormitorios: 3,
                            banos: 2,
                            tipo_propiedad: 'casa'
                        }
                    }
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            }
        },
        {
            name: 'Listar Propiedades',
            data: {
                command: {
                    type: 'list_properties',
                    originalMessage: 'LISTAR PROPIEDADES',
                    parameters: {
                        filters: {}
                    }
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            }
        },
        {
            name: 'Crear Cliente',
            data: {
                command: {
                    type: 'create_client',
                    originalMessage: 'NUEVO CLIENTE Ana García 70123456',
                    parameters: {
                        clientData: {
                            nombre: 'Ana',
                            apellido: 'García',
                            telefono: '70123456'
                        }
                    }
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            }
        },
        {
            name: 'Ayuda',
            data: {
                command: {
                    type: 'help',
                    originalMessage: 'AYUDA',
                    parameters: {}
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            }
        }
    ];

    for (const test of testCommands) {
        console.log(`📋 Probando: ${test.name}`);
        
        try {
            const response = await axios.post(`${BACKEND_URL}/api/command`, test.data);
            
            if (response.data.success) {
                console.log('   ✅ Comando ejecutado');
                console.log(`   📤 Respuesta: ${response.data.message.substring(0, 100)}...`);
            }
        } catch (error) {
            console.log('   ❌ Error:', error.response?.data?.error || error.message);
        }
        
        console.log('');
    }
}

// Test CRUD de Propiedades
async function testPropertyCRUD() {
    console.log('\n🏠 Probando CRUD de Propiedades...\n');

    try {
        // 1. Listar propiedades
        console.log('1️⃣ Listando propiedades...');
        const listResponse = await axios.get(`${BACKEND_URL}/api/properties`);
        console.log(`   ✅ ${listResponse.data.data.length} propiedades encontradas`);

        // 2. Crear propiedad
        console.log('\n2️⃣ Creando propiedad de prueba...');
        const newProperty = {
            usuario_id: 1,
            nombre_propiedad: 'Casa de Prueba',
            descripcion: 'Propiedad creada para testing',
            precio: 100000,
            ubicacion: 'Zona de Prueba',
            tamano: '150 m²',
            tipo_propiedad: 'casa',
            dormitorios: 3,
            banos: 2
        };

        try {
            const createResponse = await axios.post(`${BACKEND_URL}/api/properties`, newProperty);
            console.log('   ✅ Propiedad creada:', createResponse.data.data.id);
        } catch (error) {
            console.log('   ⚠️ Error creando (BD no disponible):', error.response?.data?.error);
        }

        // 3. Buscar propiedades
        console.log('\n3️⃣ Buscando propiedades con filtros...');
        const searchResponse = await axios.post(`${BACKEND_URL}/api/properties/search`, {
            precio_min: 50000,
            precio_max: 200000
        });
        console.log(`   ✅ ${searchResponse.data.data.length} propiedades encontradas con filtros`);

        // 4. Obtener estadísticas
        console.log('\n4️⃣ Obteniendo estadísticas de propiedades...');
        const statsResponse = await axios.get(`${BACKEND_URL}/api/properties/stats/summary`);
        console.log('   ✅ Estadísticas:', statsResponse.data.data);

    } catch (error) {
        console.error('❌ Error en CRUD de propiedades:', error.response?.data || error.message);
    }
}

// Test CRUD de Clientes
async function testClientCRUD() {
    console.log('\n👤 Probando CRUD de Clientes...\n');

    try {
        // 1. Listar clientes
        console.log('1️⃣ Listando clientes...');
        const listResponse = await axios.get(`${BACKEND_URL}/api/clients`);
        console.log(`   ✅ ${listResponse.data.data.length} clientes encontrados`);

        // 2. Crear/actualizar cliente
        console.log('\n2️⃣ Creando cliente de prueba...');
        const newClient = {
            nombre: 'Pedro',
            apellido: 'Martínez',
            telefono: '+59170999999',
            email: 'pedro@test.com',
            preferencias: 'Casa 3 dormitorios zona norte'
        };

        try {
            const createResponse = await axios.post(`${BACKEND_URL}/api/clients`, newClient);
            console.log('   ✅ Cliente procesado:', createResponse.data.data.telefono);
        } catch (error) {
            console.log('   ⚠️ Error creando (BD no disponible):', error.response?.data?.error);
        }

    } catch (error) {
        console.error('❌ Error en CRUD de clientes:', error.response?.data || error.message);
    }
}

// Test CRUD de Usuarios
async function testUserCRUD() {
    console.log('\n👨‍💼 Probando CRUD de Usuarios...\n');

    try {
        // 1. Listar usuarios
        console.log('1️⃣ Listando usuarios...');
        const listResponse = await axios.get(`${BACKEND_URL}/api/users`);
        console.log(`   ✅ ${listResponse.data.data.length} usuarios encontrados`);

        // 2. Obtener rendimiento de usuario
        console.log('\n2️⃣ Obteniendo rendimiento de usuario...');
        const performanceResponse = await axios.get(`${BACKEND_URL}/api/users/1/performance`);
        console.log('   ✅ Métricas de rendimiento:', performanceResponse.data.data.metrics);

    } catch (error) {
        console.error('❌ Error en CRUD de usuarios:', error.response?.data || error.message);
    }
}

// Test de Reportes
async function testReports() {
    console.log('\n📊 Probando Generación de Reportes...\n');

    try {
        // 1. Reporte diario
        console.log('1️⃣ Generando reporte diario...');
        const dailyResponse = await axios.get(`${BACKEND_URL}/api/reports/daily`);
        console.log('   ✅ Reporte diario generado');
        console.log('   📊 Estadísticas:', dailyResponse.data.data.stats);

        // 2. Reporte mensual
        console.log('\n2️⃣ Generando reporte mensual...');
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const monthlyResponse = await axios.get(`${BACKEND_URL}/api/reports/monthly?month=${month}&year=${year}`);
        console.log('   ✅ Reporte mensual generado');

        // 3. Top propiedades
        console.log('\n3️⃣ Obteniendo top propiedades...');
        const topResponse = await axios.get(`${BACKEND_URL}/api/reports/top-properties?limit=5`);
        console.log(`   ✅ Top ${topResponse.data.data.length} propiedades obtenidas`);

    } catch (error) {
        console.error('❌ Error en reportes:', error.response?.data || error.message);
    }
}

// Test de flujo completo de comando
async function testCompleteCommandFlow() {
    console.log('\n🔄 Probando Flujo Completo de Comando...\n');

    try {
        // Simular comando de gerente
        const commandData = {
            command: {
                type: 'daily_report',
                originalMessage: 'REPORTE DIARIO',
                parameters: {
                    date: new Date().toISOString().split('T')[0]
                }
            },
            user: {
                id: 3,
                phone: '+59170000003',
                name: 'Carlos Rodríguez',
                role: 'gerente'
            }
        };

        console.log('📤 Enviando comando de reporte diario...');
        const response = await axios.post(`${BACKEND_URL}/api/command`, commandData);

        if (response.data.success) {
            console.log('✅ Comando procesado exitosamente');
            console.log('📊 Acción:', response.data.data.action);
            console.log('💬 Mensaje generado:');
            console.log(response.data.data.message.substring(0, 200) + '...');
            
            if (response.data.data.templateId) {
                console.log('📋 Plantilla utilizada:', response.data.data.templateId);
            }
        }

    } catch (error) {
        console.error('❌ Error en flujo completo:', error.response?.data || error.message);
    }
}

// Test de permisos
async function testPermissions() {
    console.log('\n🔐 Probando Sistema de Permisos...\n');

    // Primero, obtener una propiedad existente
    let existingPropertyId = 'PROP001';
    try {
        const propertiesResponse = await axios.get(`${BACKEND_URL}/api/properties`);
        if (propertiesResponse.data.data && propertiesResponse.data.data.length > 0) {
            const firstProperty = propertiesResponse.data.data[0];
            existingPropertyId = `PROP${String(firstProperty.id).padStart(3, '0')}`;
            console.log(`📝 Usando propiedad existente: ${existingPropertyId}`);
        }
    } catch (error) {
        console.log('⚠️ No se pudieron obtener propiedades existentes');
    }

    const tests = [
        {
            name: 'Agente intenta eliminar propiedad (debe fallar)',
            command: {
                command: {
                    type: 'delete_property',
                    originalMessage: `ELIMINAR PROPIEDAD ${existingPropertyId}`,
                    parameters: { propertyId: existingPropertyId }
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            },
            shouldFail: true
        },
        {
            name: 'Gerente elimina propiedad (debe funcionar)',
            command: {
                command: {
                    type: 'delete_property',
                    originalMessage: `ELIMINAR PROPIEDAD ${existingPropertyId}`,
                    parameters: { propertyId: existingPropertyId }
                },
                user: {
                    id: 3,
                    phone: '+59170000003',
                    name: 'Carlos Rodríguez',
                    role: 'gerente'
                }
            },
            shouldFail: false
        },
        {
            name: 'Agente crea agente (debe fallar)',
            command: {
                command: {
                    type: 'create_agent',
                    originalMessage: 'REGISTRAR AGENTE Test Test 70000000',
                    parameters: {
                        agentData: {
                            nombre: 'Test',
                            apellido: 'Test',
                            telefono: '70000000'
                        }
                    }
                },
                user: {
                    id: 1,
                    phone: '+59171337051',
                    name: 'Juan Pérez',
                    role: 'agente'
                }
            },
            shouldFail: true
        }
    ];

    for (const test of tests) {
        console.log(`🧪 ${test.name}`);
        
        try {
            const response = await axios.post(`${BACKEND_URL}/api/command`, test.command);
            
            if (test.shouldFail) {
                console.log('   ❌ Comando NO debería haber funcionado');
            } else {
                console.log('   ✅ Comando ejecutado correctamente');
            }
        } catch (error) {
            if (test.shouldFail) {
                console.log('   ✅ Comando rechazado correctamente:', error.response?.data?.error);
            } else {
                console.log('   ❌ Comando falló inesperadamente:', error.response?.data?.error);
            }
        }
    }
}

// Ejecutar todas las pruebas
async function runAllTests() {
    console.log('🚀 Iniciando pruebas completas del Módulo Backend\n');
    console.log('⚠️  Asegúrate de que estén corriendo:');
    console.log('   - Módulo Backend (puerto 3004)');
    console.log('   - Base de datos (puerto 3006) - opcional pero recomendado');
    console.log('   - Módulo de respuestas (puerto 3005) - opcional\n');

    await testBackendModule();
    await testCommandProcessing();
    await testPropertyCRUD();
    await testClientCRUD();
    await testUserCRUD();
    await testReports();
    await testCompleteCommandFlow();
    await testPermissions();

    console.log('\n✨ ¡Todas las pruebas completadas!');
    console.log('\n📋 Endpoints principales:');
    console.log(`   - GET  ${BACKEND_URL}/api/health`);
    console.log(`   - POST ${BACKEND_URL}/api/command`);
    console.log(`   - GET  ${BACKEND_URL}/api/properties`);
    console.log(`   - GET  ${BACKEND_URL}/api/clients`);
    console.log(`   - GET  ${BACKEND_URL}/api/users`);
    console.log(`   - GET  ${BACKEND_URL}/api/reports/daily`);
    console.log(`   - GET  ${BACKEND_URL}/api/commands/help`);
    
    console.log('\n💡 Comandos disponibles para agentes:');
    console.log('   - NUEVA PROPIEDAD [detalles]');
    console.log('   - LISTAR PROPIEDADES');
    console.log('   - NUEVO CLIENTE [nombre] [teléfono]');
    console.log('   - REPORTE DIARIO');
    console.log('   - AYUDA');
    
    console.log('\n💡 Comandos adicionales para gerentes:');
    console.log('   - ELIMINAR PROPIEDAD [ID]');
    console.log('   - REGISTRAR AGENTE [nombre] [teléfono]');
    console.log('   - REPORTE MENSUAL [mes] [año]');
}

// Ejecutar tests
runAllTests().catch(console.error);