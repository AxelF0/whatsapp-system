class UserModel {
    constructor(client) {
        this.client = client;
    }

    // Crear usuario (agente/gerente)
    async create(userData) {
        const query = `
            INSERT INTO Usuario (cargo_id, nombre, apellido, telefono, estado)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [userData.cargo_id, userData.nombre, userData.apellido, userData.telefono, userData.estado || 1];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Buscar usuario por teléfono (para validación)
    async findByPhone(telefono) {
        const query = `
            SELECT u.*, c.nombre as cargo_nombre 
            FROM Usuario u 
            JOIN Cargo c ON u.cargo_id = c.id 
            WHERE u.telefono = $1 AND u.estado = 1
        `;
        const result = await this.client.query(query, [telefono]);
        return result.rows[0];
    }

    // Listar todos los usuarios activos
    async findAll() {
        const query = `
            SELECT u.*, c.nombre as cargo_nombre 
            FROM Usuario u 
            JOIN Cargo c ON u.cargo_id = c.id 
            WHERE u.estado = 1
            ORDER BY u.nombre, u.apellido
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Actualizar usuario
    async update(id, userData) {
        const query = `
            UPDATE Usuario 
            SET cargo_id = $1, nombre = $2, apellido = $3, telefono = $4, 
                estado = $5, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `;
        const values = [userData.cargo_id, userData.nombre, userData.apellido,
        userData.telefono, userData.estado, id];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }
}

module.exports = UserModel;