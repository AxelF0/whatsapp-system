class ClientModel {
    constructor(client) {
        this.client = client;
    }

    // Crear cliente
    async create(clientData) {
        // La tabla Cliente del script no tiene columna 'preferencias'. Mapeamos solo columnas existentes.
        const query = `
            INSERT INTO Cliente (nombre, apellido, telefono, email, estado)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [
            clientData.nombre || null,
            clientData.apellido || null,
            clientData.telefono,
            clientData.email || null,
            clientData.estado || 1
        ];
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
        // El esquema no tiene columna preferencias; como alternativa, guardarlo no es posible sin cambiar la BD
        // Devolvemos el registro sin cambios para compatibilidad
        const query = `SELECT * FROM Cliente WHERE telefono = $1`;
        const result = await this.client.query(query, [telefono]);
        return result.rows[0] || null;
    }

    // Obtener todos los clientes
    async findAll() {
        const query = `
            SELECT *
            FROM Cliente
            WHERE estado = 1
            ORDER BY nombre, apellido
        `;
        const result = await this.client.query(query);
        return result.rows;
    }
}

module.exports = ClientModel;