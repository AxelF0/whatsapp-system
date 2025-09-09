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

    async getAllClients(agente_id = null) {
        return await this.clientModel.findAll(agente_id);
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
    async findClientByIdOrPhone(identifier, agente_id = null) {
        if (!identifier) {
            throw new Error('ID o teléfono del cliente requerido');
        }
        
        // Si es un número, intentamos buscar por ID primero, luego por teléfono
        if (/^\d+$/.test(identifier)) {
            let client = await this.clientModel.findByIdAnyStatus(identifier);
            if (!client) {
                client = await this.clientModel.findByPhoneAnyStatus(identifier);
            }
            // Filtrar por agente si se especifica
            if (client && agente_id && client.agente_id !== agente_id) {
                return null;
            }
            return client;
        }
        // Si no es solo números, buscar por teléfono
        const client = await this.clientModel.findByPhoneAnyStatus(identifier);
        // Filtrar por agente si se especifica
        if (client && agente_id && client.agente_id !== agente_id) {
            return null;
        }
        return client;
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

    // Obtener todos los clientes sin filtrar por estado, pero solo del agente si se pasa
    async getAllClientsAnyStatus(agente_id = null) {
        const all = await this.clientModel.findAllAnyStatus();
        if (agente_id) {
            return all.filter(c => c.agente_id === agente_id);
        }
        return all;
    }

    // Obtener clientes por estado específico, pero solo del agente si se pasa
    async getClientsByStatus(estado, agente_id = null) {
        if (estado !== 0 && estado !== 1) {
            throw new Error('Estado debe ser 0 (inactivo) o 1 (activo)');
        }
        const all = await this.clientModel.findByStatus(estado);
        if (agente_id) {
            return all.filter(c => c.agente_id === agente_id);
        }
        return all;
    }

    // Obtener clientes inactivos/eliminados solo del agente si se pasa
    async getInactiveClients(agente_id = null) {
        return await this.getClientsByStatus(0, agente_id);
    }
}

module.exports = ClientService;