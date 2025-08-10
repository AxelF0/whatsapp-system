require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });  // Cargar las variables de entorno desde .env
const { Client } = require('pg'); // Importar el cliente de PostgreSQL

/*console.log('PG_USER:', typeof process.env.PG_USER, process.env.PG_USER);
console.log('PG_HOST:', typeof process.env.PG_HOST, process.env.PG_HOST);
console.log('PG_DATABASE:', typeof process.env.PG_DATABASE, process.env.PG_DATABASE);
console.log('PG_PASSWORD:', typeof process.env.PG_PASSWORD, process.env.PG_PASSWORD);
console.log('PG_PORT:', typeof process.env.PG_PORT, process.env.PG_PORT);*/

// Configuración de la conexión a PostgreSQL
const client = new Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

// Conexión a PostgreSQL
client.connect()
    .then(() => {
        console.log('Conexión a PostgreSQL exitosa');
    })
    .catch(err => {
        console.error('Error de conexión PostgreSQL:', err);
    });

// Exportar el cliente para utilizarlo en otros archivos
module.exports = client;
