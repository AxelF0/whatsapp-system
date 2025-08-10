// servidor/modulo-base-datos/src/test/testServices.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

console.log('🧪 Iniciando prueba de servicios...\n');

async function testServices() {
    try {
        // Importar conexiones
        const pgClient = require('../connections/pgConnection');
        const mongoose = require('../connections/mongoConnection');

        // Importar modelos
        const UserModel = require('../models/postgresql/userModel');
        const ClientModel = require('../models/postgresql/clientModel');
        const PropertyModel = require('../models/postgresql/propertyModel');
        const { Message, Conversation } = require('../models/mongodb');

        // Importar servicios
        const UserService = require('../services/userService');
        const ClientService = require('../services/clientService');
        const PropertyService = require('../services/propertyService');
        const MessageService = require('../services/messageService');

        // Inicializar modelos
        const userModel = new UserModel(pgClient);
        const clientModel = new ClientModel(pgClient);
        const propertyModel = new PropertyModel(pgClient);

        // Inicializar servicios
        const userService = new UserService(userModel);
        const clientService = new ClientService(clientModel);
        const propertyService = new PropertyService(propertyModel);
        const messageService = new MessageService(Message, Conversation);

        console.log('✅ Servicios inicializados correctamente\n');

        // ==================== PRUEBAS USER SERVICE ====================
        console.log('👥 PROBANDO USER SERVICE...');

        // Validar usuario existente
        const existingUser = await userService.validateUser('+59170000001');
        console.log('✅ Usuario validado:', existingUser ? `${existingUser.nombre} (${existingUser.cargo_nombre})` : 'No encontrado');

        // Intentar crear usuario duplicado (debería fallar)
        try {
            await userService.createUser({
                cargo_id: 1,
                nombre: 'Test',
                apellido: 'Duplicado',
                telefono: '+59170000001'
            });
            console.log('❌ ERROR: Debería haber fallado al crear usuario duplicado');
        } catch (error) {
            console.log('✅ Correctamente rechazó usuario duplicado:', error.message);
        }

        // Crear nuevo usuario
        const newUser = await userService.createUser({
            cargo_id: 1,
            nombre: 'Pedro',
            apellido: 'Martinez',
            telefono: '+59170000004'
        });
        console.log('✅ Usuario creado:', `${newUser.nombre} ${newUser.apellido}`);

        // ==================== PRUEBAS CLIENT SERVICE ====================
        console.log('\n👤 PROBANDO CLIENT SERVICE...');

        // Crear cliente nuevo
        const newClient = await clientService.createOrUpdateClient({
            nombre: 'Ana',
            apellido: 'Gonzalez',
            telefono: '+59160000001',
            preferencias: 'Casa en zona norte, 3 dormitorios'
        });
        console.log('✅ Cliente creado:', `${newClient.nombre} ${newClient.apellido}`);

        // Buscar cliente por teléfono
        const foundClient = await clientService.getClientByPhone('+59160000001');
        console.log('✅ Cliente encontrado:', foundClient ? `${foundClient.nombre}` : 'No encontrado');

        // Actualizar preferencias
        const updatedClient = await clientService.updateClientPreferences(
            '+59160000001', 
            'Casa o departamento, zona norte o sur, presupuesto $50k-80k'
        );
        console.log('✅ Preferencias actualizadas');

        // ==================== PRUEBAS PROPERTY SERVICE ====================
        console.log('\n🏠 PROBANDO PROPERTY SERVICE...');

        // Crear propiedad
        const newProperty = await propertyService.createProperty({
            usuario_id: newUser.id,
            nombre_propiedad: 'Casa Colonial en Centro',
            descripcion: 'Hermosa casa colonial restaurada en el centro histórico',
            precio: 75000.00,
            ubicacion: 'Centro Histórico',
            tamano: '180m2',
            tipo_propiedad: 'Casa',
            dormitorios: 3,
            banos: 2
        });
        console.log('✅ Propiedad creada:', `${newProperty.nombre_propiedad} - $${newProperty.precio}`);

        // Agregar archivo a propiedad
        const propertyFile = await propertyService.addPropertyFile(newProperty.id, {
            nombre_archivo: 'fachada.jpg',
            url: '/uploads/images/fachada.jpg',
            tipo_archivo: 'image'
        });
        console.log('✅ Archivo agregado a propiedad');

        // Buscar propiedades por filtros
        const searchResults = await propertyService.searchProperties({
            precio_min: 50000,
            precio_max: 100000,
            tipo_propiedad: 'Casa'
        });
        console.log('✅ Búsqueda de propiedades:', `${searchResults.length} resultados`);

        // Obtener propiedad completa con archivos
        const fullProperty = await propertyService.getPropertyById(newProperty.id);
        console.log('✅ Propiedad completa obtenida:', fullProperty.archivos ? `${fullProperty.archivos.length} archivos` : '0 archivos');

        // ==================== PRUEBAS MESSAGE SERVICE ====================
        console.log('\n💬 PROBANDO MESSAGE SERVICE...');

        // Guardar mensaje
        const testMessage = await messageService.saveMessage({
            messageId: `msg_${Date.now()}`,
            from: '+59160000001',
            to: '+59170000001',
            body: 'Hola, me interesa la casa colonial',
            type: 'text',
            direction: 'incoming',
            source: 'whatsapp-web'
        });
        console.log('✅ Mensaje guardado:', testMessage._id);

        // Obtener conversación
        const conversation = await messageService.getConversationHistory('+59160000001', '+59170000001');
        console.log('✅ Conversación obtenida:', `${conversation.messages.length} mensajes`);

        // Marcar mensaje como procesado
        await messageService.markMessageAsProcessed(testMessage._id);
        console.log('✅ Mensaje marcado como procesado');

        // ==================== LIMPIAR DATOS DE PRUEBA ====================
        console.log('\n🧹 LIMPIANDO DATOS DE PRUEBA...');

        // Eliminar propiedad de prueba
        await pgClient.query('DELETE FROM Propiedad WHERE ubicacion = $1', ['Centro Histórico']);

        // Eliminar usuario de prueba
        await pgClient.query('DELETE FROM Usuario WHERE telefono = $1', ['+59170000004']);
        
        // Eliminar cliente de prueba
        await pgClient.query('DELETE FROM Cliente WHERE telefono = $1', ['+59160000001']);
        
        // Eliminar mensajes de prueba
        await Message.deleteMany({ messageId: testMessage.messageId });
        await Conversation.deleteMany({ conversationId: conversation.conversationId });
        
        console.log('✅ Datos de prueba eliminados');

        // Cerrar conexiones
        await mongoose.disconnect();
        await pgClient.end();

        console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');

    } catch (error) {
        console.error('\n❌ ERROR EN PRUEBAS:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testServices();