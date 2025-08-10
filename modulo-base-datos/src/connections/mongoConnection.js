require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });  // Cargar las variables de entorno desde .env

const mongoose = require('mongoose');  // Importa Mongoose

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log('Conexión a MongoDB exitosa');
})
.catch(err => {
    console.error('Error de conexión MongoDB:', err);
});

// Exportamos mongoose para usarlo en otros archivos
module.exports = mongoose;
