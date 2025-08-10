// servidor/modulo-base-datos/src/test/testConnections.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

console.log('🧪 Iniciando prueba de conexiones...\n');

async function testPostgreSQL() {
    console.log('📊 Probando PostgreSQL...');
    try {
        const { Client } = require('pg');
        
        const client = new Client({
            user: process.env.PG_USER,
            host: process.env.PG_HOST,
            database: process.env.PG_DATABASE,
            password: process.env.PG_PASSWORD,
            port: process.env.PG_PORT,
        });

        await client.connect();
        console.log('✅ Conexión PostgreSQL exitosa');
        
        // Probar una consulta simple
        const result = await client.query('SELECT COUNT(*) as total FROM Usuario');
        console.log(`📋 Total usuarios en BD: ${result.rows[0].total}`);
        
        // Probar los cargos
        const cargos = await client.query('SELECT * FROM Cargo');
        console.log('👥 Cargos disponibles:', cargos.rows);
        
        await client.end();
        return true;
    } catch (error) {
        console.error('❌ Error PostgreSQL:', error.message);
        return false;
    }
}

async function testMongoDB() {
    console.log('\n🍃 Probando MongoDB...');
    try {
        const mongoose = require('mongoose');
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión MongoDB exitosa');
        
        // Probar crear una colección de prueba
        const testSchema = new mongoose.Schema({
            test: String,
            timestamp: { type: Date, default: Date.now }
        });
        
        const TestModel = mongoose.model('Test', testSchema);
        
        // Insertar documento de prueba
        const testDoc = await TestModel.create({ test: 'conexion_exitosa' });
        console.log('📄 Documento de prueba creado:', testDoc._id);
        
        // Eliminar documento de prueba
        await TestModel.deleteOne({ _id: testDoc._id });
        console.log('🗑️ Documento de prueba eliminado');
        
        await mongoose.disconnect();
        return true;
    } catch (error) {
        console.error('❌ Error MongoDB:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('Variables de entorno cargadas:');
    console.log('- PG_DATABASE:', process.env.PG_DATABASE);
    console.log('- PG_HOST:', process.env.PG_HOST);
    console.log('- MONGO_URI:', process.env.MONGO_URI ? '✓ Configurado' : '❌ No configurado');
    console.log('');

    const pgResult = await testPostgreSQL();
    const mongoResult = await testMongoDB();
    
    console.log('\n📊 RESUMEN DE PRUEBAS:');
    console.log('PostgreSQL:', pgResult ? '✅ OK' : '❌ ERROR');
    console.log('MongoDB:', mongoResult ? '✅ OK' : '❌ ERROR');
    
    if (pgResult && mongoResult) {
        console.log('\n🎉 ¡Todas las conexiones funcionan correctamente!');
        process.exit(0);
    } else {
        console.log('\n⚠️ Hay problemas con las conexiones. Revisa la configuración.');
        process.exit(1);
    }
}

runTests();