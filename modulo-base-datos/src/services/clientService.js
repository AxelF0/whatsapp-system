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
}

module.exports = ClientService;