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
        // Esta función la implementaremos en el modelo después
        return [];
    }
}

module.exports = ClientService;