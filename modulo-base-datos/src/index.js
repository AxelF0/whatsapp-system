// servidor/modulo-base-datos/src/index.js - API REST Principal
const express = require('express');
const cors = require('cors');

// Conexiones a bases de datos
const pgClient = require('./connections/pgConnection');

// Modelos
const  UserModel = require('./models/postgresql/userModel');
const ClientModel = require('./models/postgresql/clientModel');
const PropertyModel = require('./models/postgresql/propertyModel');
const PropertyFileModel = require('./models/postgresql/propertyFileModel');

// Servicios
const UserService = require('./services/userService');
const ClientService = require('./services/clientService');
const PropertyService = require('./services/propertyService');
const PropertyFileService = require('./services/propertyFileService');

const app = express();
const PORT = process.env.DATABASE_PORT || 3006;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar modelos con conexiones
const userModel = new UserModel(pgClient);
const clientModel = new ClientModel(pgClient);
const propertyModel = new PropertyModel(pgClient);
const propertyFileModel = new PropertyFileModel(pgClient);

// Inicializar servicios
const userService = new UserService(userModel);
const clientService = new ClientService(clientModel);
const propertyService = new PropertyService(propertyModel);
const propertyFileService = new PropertyFileService(propertyFileModel);

// Hacer servicios disponibles para otros módulos
app.locals.services = {
    userService,
    clientService,
    propertyService,
    propertyFileService
};

// Rutas para Usuarios
app.get('/api/users', async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = await userService.createUser(req.body);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/users/validate/:phone', async (req, res) => {
    try {
        const user = await userService.validateUser(req.params.phone);
        if (user) {
            res.json({ success: true, valid: true, data: user });
        } else {
            res.json({ success: true, valid: false });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para buscar usuario por teléfono sin filtrar por estado (para baja/alta)
app.get('/api/users/find-any-status/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        console.log(`🔍 Buscando usuario por teléfono sin filtrar estado: ${phone}`);
        
        const user = await userService.findUserByPhoneAnyStatus(phone);
        console.log(`📊 Resultado búsqueda teléfono ${phone}:`, user ? `Encontrado: ${user.nombre}` : 'No encontrado');
        
        if (user) {
            res.json({
                success: true,
                data: user
            });
        } else {
            res.json({
                success: false,
                data: null,
                error: 'Usuario no encontrado'
            });
        }
    } catch (error) {
        console.error('❌ Error buscando usuario por teléfono:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// Endpoint para buscar usuario por ID sin filtrar por estado (para baja/alta)
app.get('/api/users/find-any-status-by-id/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        console.log(`🔍 Buscando usuario por ID sin filtrar estado: ${userId}`);
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                error: 'ID de usuario inválido'
            });
        }
        
        const user = await userService.findUserByIdAnyStatus(userId);
        console.log(`📊 Resultado búsqueda ID ${userId}:`, user ? `Encontrado: ${user.nombre}` : 'No encontrado');
        
        if (user) {
            res.json({
                success: true,
                data: user
            });
        } else {
            res.json({
                success: false,
                data: null,
                error: 'Usuario no encontrado'
            });
        }
    } catch (error) {
        console.error('❌ Error buscando usuario por ID:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// Endpoint para listar usuarios por estado (activos/inactivos)
app.get('/api/users/by-status/:status', async (req, res) => {
    try {
        const status = parseInt(req.params.status);
        if (status !== 0 && status !== 1) {
            return res.status(400).json({
                success: false,
                error: 'Estado debe ser 0 (inactivo) o 1 (activo)'
            });
        }
        
        const users = await userService.getUsersByStatus(status);
        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Error listando usuarios por estado:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// Obtener usuario por ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
        }
        
        const user = await userService.getUserById(userId);
        if (user) {
            res.json({ success: true, data: user });
        } else {
            res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar usuario por ID
app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
        }
        
        const updatedUser = await userService.updateUser(userId, req.body);
        res.json({ success: true, data: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rutas para Clientes
app.get('/api/clients', async (req, res) => {
    try {
        const agente_id = req.query.agente_id ? Number(req.query.agente_id) : null;
        const clients = await clientService.getAllClients(agente_id);
        res.json({ success: true, data: clients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clients', async (req, res) => {
    try {
        const client = await clientService.createOrUpdateClient(req.body);
        res.status(201).json({ success: true, data: client });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/clients/phone/:phone', async (req, res) => {
    try {
        const client = await clientService.getClientByPhone(req.params.phone);
        if (client) {
            res.json({ success: true, data: client });
        } else {
            res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/clients/find/:identifier', async (req, res) => {
    try {
        const agente_id = req.query.agente_id ? Number(req.query.agente_id) : null;
        const client = await clientService.findClientByIdOrPhone(req.params.identifier, agente_id);
        if (client) {
            res.json({ success: true, data: client });
        } else {
            res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/clients/:id', async (req, res) => {
    try {
        const client = await clientService.updateClientById(req.params.id, req.body);
        if (client) {
            res.json({ success: true, data: client });
        } else {
            res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener clientes inactivos/eliminados
app.get('/api/clients/inactive', async (req, res) => {
    try {
        const agente_id = req.query.agente_id ? Number(req.query.agente_id) : null;
        const clients = await clientService.getInactiveClients(agente_id);
        res.json({ success: true, data: clients });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar estado de cliente
app.put('/api/clients/:id/status', async (req, res) => {
    try {
        const client = await clientService.updateClientStatus(req.params.id, req.body.estado);
        if (client) {
            res.json({ success: true, data: client });
        } else {
            res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rutas para Propiedades
app.get('/api/properties', async (req, res) => {
    try {
        const properties = await propertyService.searchProperties(req.query);
        res.json({ success: true, data: properties });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar propiedades con filtros
app.post('/api/properties/search', async (req, res) => {
    try {
        const properties = await propertyService.searchProperties(req.body);
        res.json({ success: true, data: properties });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar TODAS las propiedades (sin filtros)
app.get('/api/properties/all', async (req, res) => {
    try {
        const properties = await propertyService.searchAll();
        res.json({ success: true, data: properties });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        const property = await propertyService.getPropertyById(req.params.id);
        if (property) {
            res.json({ success: true, data: property });
        } else {
            res.status(404).json({ success: false, error: 'Propiedad no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener propiedad por ID (cualquier estado)
app.get('/api/properties/:id/any-status', async (req, res) => {
    try {
        const property = await propertyService.getPropertyByIdAnyStatus(req.params.id);
        if (property) {
            res.json({ success: true, data: property });
        } else {
            res.status(404).json({ success: false, error: 'Propiedad no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/properties', async (req, res) => {
    try {
        const property = await propertyService.createProperty(req.body);
        res.status(201).json({ success: true, data: property });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Actualizar propiedad
app.put('/api/properties/:id', async (req, res) => {
    try {
        const propertyId = parseInt(req.params.id);
        if (isNaN(propertyId)) {
            return res.status(400).json({ success: false, error: 'ID de propiedad inválido' });
        }
        
        const updatedProperty = await propertyService.updateProperty(propertyId, req.body);
        res.json({ success: true, data: updatedProperty });
    } catch (error) {
        const status = error.message.includes('no encontrada') ? 404 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
});

// Eliminar (soft delete) propiedad
app.delete('/api/properties/:id', async (req, res) => {
    try {
        const deleted = await propertyService.deleteProperty(parseInt(req.params.id, 10));
        res.json({ success: true, data: deleted });
    } catch (error) {
        const status = error.message === 'Propiedad no encontrada' ? 404 : 400;
        res.status(status).json({ success: false, error: error.message });
    }
});

// Cambiar estado de propiedad (toggle)
app.put('/api/properties/:id/toggle-status', async (req, res) => {
    try {
        const property = await propertyService.toggleStatus(parseInt(req.params.id, 10));
        res.json({ success: true, data: property });
    } catch (error) {
        const status = error.message.includes('no encontrada') ? 404 : 400;
        res.status(status).json({ success: false, error: error.message });
    }
});

app.get('/api/conversations/:clientPhone/:agentPhone', async (req, res) => {
    try {
        const conversation = await messageService.getOrCreateConversation(
            req.params.clientPhone,
            req.params.agentPhone
        );
        res.json({ success: true, data: conversation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Test PostgreSQL
        await pgClient.query('SELECT 1');
        
        res.json({
            success: true,
            status: 'healthy',
            databases: {
                postgresql: 'connected',
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

// ==================== RUTAS PARA ARCHIVOS DE PROPIEDADES ====================

// Crear archivo de propiedad
app.post('/api/property-files', async (req, res) => {
    try {
        const fileData = req.body;
        const newFile = await propertyFileService.createPropertyFile(fileData);
        res.status(201).json({ success: true, data: newFile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener archivos por ID de propiedad
app.get('/api/property-files/property/:propertyId', async (req, res) => {
    try {
        const { propertyId } = req.params;
        const files = await propertyFileService.getFilesByPropertyId(parseInt(propertyId));
        res.json({ success: true, data: files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener archivo por ID
app.get('/api/property-files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await propertyFileService.getFileById(parseInt(fileId));
        res.json({ success: true, data: file });
    } catch (error) {
        res.status(404).json({ success: false, error: error.message });
    }
});

// Actualizar archivo
app.put('/api/property-files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const updateData = req.body;
        const updatedFile = await propertyFileService.updateFile(parseInt(fileId), updateData);
        res.json({ success: true, data: updatedFile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar archivo
app.delete('/api/property-files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const deletedFile = await propertyFileService.deleteFile(parseInt(fileId));
        res.json({ success: true, data: deletedFile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas de archivos por propiedad
app.get('/api/property-files/property/:propertyId/stats', async (req, res) => {
    try {
        const { propertyId } = req.params;
        const stats = await propertyFileService.getFileStatsByProperty(parseInt(propertyId));
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener tipos de archivo disponibles
app.get('/api/file-types', async (req, res) => {
    try {
        const fileTypes = await propertyFileService.getFileTypes();
        res.json({ success: true, data: fileTypes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`📊 Módulo Base de Datos ejecutándose en puerto ${PORT}`);
});

module.exports = app;