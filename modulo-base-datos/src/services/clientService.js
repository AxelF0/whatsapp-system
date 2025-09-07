class ClientService {
    constructor(clientModel) {
        this.clientModel = clientModel;
    }

    async createOrUpdateClient(clientData) {
        // Si viene con teléfono, buscar o crear
        if (clientData.telefono) {
            return await this.clientModel.findOrCreate(clientData);
        }
        
        // Si no tiene teléfono, crear directamente
        return await this.clientModel.create(clientData);
    }

    async getClientByPhone(telefono) {
        if (!telefono) {
            throw new Error('Número de teléfono requerido');
        }
        return await this.clientModel.findByPhone(telefono);
    }

    async updateClientPreferences(telefono, preferencias) {
        if (!telefono) {
            throw new Error('Número de teléfono requerido');
        }
        return await this.clientModel.updatePreferences(telefono, preferencias);
    }

    async getAllClients() {
        return await this.clientModel.findAll();
    }

    async getClientById(id) {
        if (!id) {
            throw new Error('ID del cliente requerido');
        }
        return await this.clientModel.findById(id);
    }

    async getClientByIdOrPhone(identifier) {
        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }
        return await this.clientModel.findByIdOrPhone(identifier);
    }

    async updateClientById(id, clientData) {
        if (!id) {
            throw new Error('ID del cliente requerido');
        }
        return await this.clientModel.updateById(id, clientData);
    }

    // Buscar cliente por ID o teléfono (cualquier estado)
    async findClientByIdOrPhone(identifier) {
        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }
        
        // Si es un número, intentamos buscar por ID primero, luego por teléfono
        if (/^\d+$/.test(identifier)) {
            let client = await this.clientModel.findByIdAnyStatus(identifier);
            if (!client) {
                client = await this.clientModel.findByPhoneAnyStatus(identifier);
            }
            return client;
        }
        // Si no es solo números, buscar por teléfono
        return await this.clientModel.findByPhoneAnyStatus(identifier);
    }

    // Actualizar estado del cliente
    async updateClientStatus(id, estado) {
        if (!id) {
            throw new Error('ID del cliente requerido');
        }
        if (estado !== 0 && estado !== 1) {
            throw new Error('Estado debe ser 0 (inactivo) o 1 (activo)');
        }
        return await this.clientModel.updateStatus(id, estado);
    }

    // Obtener todos los clientes sin filtrar por estado
    async getAllClientsAnyStatus() {
        return await this.clientModel.findAllAnyStatus();
    }

    // Obtener clientes por estado específico
    async getClientsByStatus(estado) {
        if (estado !== 0 && estado !== 1) {
            throw new Error('Estado debe ser 0 (inactivo) o 1 (activo)');
        }
        return await this.clientModel.findByStatus(estado);
    }

    // Obtener clientes inactivos/eliminados
    async getInactiveClients() {
        return await this.getClientsByStatus(0);
    }
}

module.exports = ClientService;