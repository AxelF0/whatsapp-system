class ClientModel {
    constructor(client) {
        this.client = client;
    }

    // Crear cliente
    async create(clientData) {
        const query = `
            INSERT INTO Cliente (nombre, apellido, telefono, preferencias, email, estado)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [clientData.nombre, clientData.apellido, clientData.telefono,
        clientData.preferencias, clientData.email, clientData.estado || 1];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Buscar cliente por teléfono
    async findByPhone(telefono) {
        const query = `SELECT * FROM Cliente WHERE telefono = $1`;
        const result = await this.client.query(query, [telefono]);
        return result.rows[0];
    }

    // Buscar o crear cliente
    async findOrCreate(clientData) {
        let client = await this.findByPhone(clientData.telefono);
        if (!client) {
            client = await this.create(clientData);
        }
        return client;
    }

    // Actualizar preferencias de cliente
    async updatePreferences(telefono, preferencias) {
        const query = `
            UPDATE Cliente 
            SET preferencias = $1, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE telefono = $2
            RETURNING *
        `;
        const result = await this.client.query(query, [preferencias, telefono]);
        return result.rows[0];
    }

    // Obtener todos los clientes
    async findAll() {
        const query = `
            SELECT * FROM Cliente 
            WHERE estado = 1 
            ORDER BY fecha_creacion DESC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }
}

module.exports = ClientModel;