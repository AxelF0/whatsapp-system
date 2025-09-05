// servidor/modulo-base-datos/src/index.js - API REST Principal

const express = require('express');
const cors = require('cors');

// Conexiones a bases de datos
const pgClient = require('./connections/pgConnection');
const mongoose = require('./connections/mongoConnection');

// Modelos
const  UserModel = require('./models/postgresql/userModel');
const ClientModel = require('./models/postgresql/clientModel');
const PropertyModel = require('./models/postgresql/propertyModel');

const { Message, Conversation } = require('./models/mongodb');

// Servicios
const UserService = require('./services/userService');
const ClientService = require('./services/clientService');
const PropertyService = require('./services/propertyService');
const MessageService = require('./services/messageService');
const SessionService = require('./services/sessionService');

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

// Inicializar servicios
const userService = new UserService(userModel);
const clientService = new ClientService(clientModel);
const propertyService = new PropertyService(propertyModel);
const messageService = new MessageService(Message, Conversation);
const sessionService = new SessionService(userModel);

// Hacer servicios disponibles para otros módulos
app.locals.services = {
    userService,
    clientService,
    propertyService,
    messageService,
    sessionService
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
        const clients = await clientService.getAllClients();
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
        const client = await clientService.getClientByIdOrPhone(req.params.identifier);
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

app.post('/api/properties', async (req, res) => {
    try {
        const property = await propertyService.createProperty(req.body);
        res.status(201).json({ success: true, data: property });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
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

// Rutas para Mensajes (MongoDB)
app.post('/api/messages', async (req, res) => {
    try {
        const message = await messageService.saveMessage(req.body);
        res.status(201).json({ success: true, data: message });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
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

// Rutas para Sesiones de Usuarios (MongoDB)
app.post('/api/sessions/validate', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Número de teléfono requerido' 
            });
        }

        const result = await sessionService.validateAndCreateSession(phoneNumber);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sessions/:phoneNumber', async (req, res) => {
    try {
        const session = await sessionService.getActiveSession(req.params.phoneNumber);
        if (session) {
            res.json({ success: true, data: session });
        } else {
            res.status(404).json({ success: false, error: 'Sesión no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/sessions/:phoneNumber', async (req, res) => {
    try {
        const result = await sessionService.closeSession(req.params.phoneNumber);
        res.json({ success: true, data: { closed: result } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/sessions/:phoneNumber/menu', async (req, res) => {
    try {
        const { menuState } = req.body;
        const result = await sessionService.updateMenuState(req.params.phoneNumber, menuState);
        res.json({ success: true, data: { updated: result } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sessions/stats/summary', async (req, res) => {
    try {
        const stats = await sessionService.getSessionStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Test PostgreSQL
        await pgClient.query('SELECT 1');
        
        // Test MongoDB
        const mongoStatus = mongoose.connection.readyState;
        
        res.json({
            success: true,
            status: 'healthy',
            databases: {
                postgresql: 'connected',
                mongodb: mongoStatus === 1 ? 'connected' : 'disconnected'
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`📊 Módulo Base de Datos ejecutándose en puerto ${PORT}`);
    
    // Tarea de limpieza de sesiones expiradas cada 10 minutos
    setInterval(async () => {
        try {
            const cleaned = await sessionService.cleanExpiredSessions();
            if (cleaned > 0) {
                console.log(`🧹 Limpieza automática: ${cleaned} sesiones expiradas eliminadas`);
            }
        } catch (error) {
            console.error('❌ Error en limpieza automática:', error.message);
        }
    }, 10 * 60 * 1000); // 10 minutos
});

module.exports = app;