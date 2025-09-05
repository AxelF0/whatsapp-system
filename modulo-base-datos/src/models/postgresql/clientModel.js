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

    // Buscar cliente por ID
    async findById(id) {
        const query = `SELECT * FROM Cliente WHERE id = $1`;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Buscar cliente por ID o teléfono
    async findByIdOrPhone(identifier) {
        // Si es un número, intentamos buscar por ID primero, luego por teléfono
        if (/^\d+$/.test(identifier)) {
            let client = await this.findById(identifier);
            if (!client) {
                client = await this.findByPhone(identifier);
            }
            return client;
        }
        // Si no es solo números, buscar por teléfono
        return await this.findByPhone(identifier);
    }

    // Buscar o crear cliente
    async findOrCreate(clientData) {
        let client = await this.findByPhone(clientData.telefono);
        if (!client) {
            client = await this.create(clientData);
        } else if (Object.keys(clientData).length > 1) { // Si hay más datos además del teléfono
            // Actualizar cliente existente
            const query = `
                UPDATE Cliente 
                SET nombre = COALESCE($1, nombre),
                    apellido = COALESCE($2, apellido),
                    email = COALESCE($3, email),
                    estado = COALESCE($4, estado)
                WHERE telefono = $5
                RETURNING *
            `;
            const values = [
                clientData.nombre || null,
                clientData.apellido || null,
                clientData.email || null,
                clientData.estado || 1,
                clientData.telefono
            ];
            const result = await this.client.query(query, values);
            client = result.rows[0];
        }
        return client;
    }

    // Método obsoleto - las preferencias ya no se usan
    async updatePreferences(telefono, preferencias) {
        // Este método se mantiene para compatibilidad pero no hace nada
        // ya que el campo preferencias no existe en la base de datos
        const query = `SELECT * FROM Cliente WHERE telefono = $1`;
        const result = await this.client.query(query, [telefono]);
        return result.rows[0] || null;
    }

    // Obtener todos los clientes
    async findAll() {
        const query = `
            SELECT id, nombre, apellido, telefono, email, estado, fecha_creacion
            FROM Cliente 
            WHERE estado = 1 
            ORDER BY id ASC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Actualizar cliente completo por ID
    async updateById(id, clientData) {
        const query = `
            UPDATE Cliente 
            SET nombre = $1,
                apellido = $2,
                email = $3,
                telefono = $4,
                fecha_modificacion = NOW()
            WHERE id = $5
            RETURNING *
        `;
        const values = [
            clientData.nombre,
            clientData.apellido,
            clientData.email || null,
            clientData.telefono,
            id
        ];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Actualizar cliente completo por teléfono (método legacy)
    async update(clientData) {
        const query = `
            UPDATE Cliente 
            SET nombre = $1,
                apellido = $2,
                email = $3,
                fecha_modificacion = NOW()
            WHERE telefono = $4
            RETURNING *
        `;
        const values = [
            clientData.nombre,
            clientData.apellido,
            clientData.email || null,
            clientData.telefono
        ];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }
}

module.exports = ClientModel;