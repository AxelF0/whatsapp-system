class PropertyModel {
    constructor(client) {
        this.client = client;
    }

    // Crear propiedad
    async create(propertyData) {
        const query = `
            INSERT INTO Propiedad (usuario_id, nombre_propiedad, descripcion, precio, 
                                 ubicacion, tamano, tipo_propiedad, dormitorios, banos, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        const values = [
            propertyData.usuario_id, propertyData.nombre_propiedad, propertyData.descripcion,
            propertyData.precio, propertyData.ubicacion, propertyData.tamano,
            propertyData.tipo_propiedad, propertyData.dormitorios, propertyData.banos,
            propertyData.estado || 1
        ];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Buscar propiedades por filtros
    async findByFilters(filters) {
        let query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1
        `;
        const values = [];
        let paramCount = 1;

        if (filters.precio_min) {
            query += ` AND p.precio >= $${paramCount}`;
            values.push(filters.precio_min);
            paramCount++;
        }

        if (filters.precio_max) {
            query += ` AND p.precio <= $${paramCount}`;
            values.push(filters.precio_max);
            paramCount++;
        }

        if (filters.ubicacion) {
            query += ` AND p.ubicacion ILIKE $${paramCount}`;
            values.push(`%${filters.ubicacion}%`);
            paramCount++;
        }

        if (filters.tipo_propiedad) {
            query += ` AND p.tipo_propiedad = $${paramCount}`;
            values.push(filters.tipo_propiedad);
            paramCount++;
        }

        if (filters.dormitorios) {
            query += ` AND p.dormitorios >= $${paramCount}`;
            values.push(filters.dormitorios);
            paramCount++;
        }

        query += ` GROUP BY p.id, u.nombre, u.apellido ORDER BY p.fecha_creacion DESC`;

        const result = await this.client.query(query, values);
        return result.rows;
    }

    // Obtener propiedad por ID con archivos
    async findById(id) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   json_agg(
                       json_build_object(
                           'id', pa.id,
                           'url', pa.url,
                           'nombre_archivo', pa.nombre_archivo,
                           'tipo_archivo', pa.tipo_archivo
                       )
                   ) FILTER (WHERE pa.id IS NOT NULL) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.id = $1 AND p.estado = 1
            GROUP BY p.id, u.nombre, u.apellido
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Agregar archivo a propiedad
    async addFile(propertyId, fileData) {
        const query = `
            INSERT INTO Propiedad_archivo (propiedad_id, nombre_archivo, url, tipo_archivo, estado)
            VALUES ($1, $2, $3, $4, 1)
            RETURNING *
        `;
        const values = [propertyId, fileData.nombre_archivo, fileData.url, fileData.tipo_archivo];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }
}

module.exports = PropertyModel;