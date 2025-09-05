class PropertyModel {
    constructor(client) {
        this.client = client;
    }

    // Crear propiedad
    async create(propertyData) {
        // Mapear a columnas reales del esquema: superficie, dimensiones (no existen tamano/dormitorios/banos)
        const query = `
            INSERT INTO Propiedad (usuario_id, nombre_propiedad, descripcion, precio,
                                   ubicacion, superficie, dimensiones, tipo_propiedad, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            propertyData.usuario_id,
            propertyData.nombre_propiedad,
            propertyData.descripcion || null,
            propertyData.precio,
            propertyData.ubicacion,
            propertyData.superficie || propertyData.tamano || null,
            propertyData.dimensiones || null,
            propertyData.tipo_propiedad || null,
            propertyData.estado || 1
        ];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Buscar TODAS las propiedades del sistema (sin filtros)
    async findAll() {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1
            GROUP BY p.id, u.nombre, u.apellido 
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Buscar MIS propiedades (por usuario_id)
    async findByUserId(usuario_id) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1 AND p.usuario_id = $1
            GROUP BY p.id, u.nombre, u.apellido 
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [usuario_id]);
        return result.rows;
    }

    // Buscar propiedades por PRECIO MÁXIMO
    async findByMaxPrice(precio_max) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1 AND p.precio <= $1
            GROUP BY p.id, u.nombre, u.apellido 
            ORDER BY p.precio ASC
        `;
        const result = await this.client.query(query, [precio_max]);
        return result.rows;
    }

    // Buscar propiedades por UBICACIÓN
    async findByLocation(ubicacion) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1 AND p.ubicacion ILIKE $1
            GROUP BY p.id, u.nombre, u.apellido 
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [`%${ubicacion}%`]);
        return result.rows;
    }

    // Buscar propiedades por TIPO
    async findByType(tipo_propiedad) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   array_agg(pa.url) as archivos
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN Propiedad_archivo pa ON p.id = pa.propiedad_id AND pa.estado = 1
            WHERE p.estado = 1 AND p.tipo_propiedad = $1
            GROUP BY p.id, u.nombre, u.apellido 
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [tipo_propiedad]);
        return result.rows;
    }

    // Buscar propiedades con MÚLTIPLES FILTROS (búsqueda personalizada)
    async findByMultipleFilters(filters) {
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

    // Actualizar propiedad
    async update(id, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        // Construir dinámicamente la query según los campos a actualizar
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && ['nombre_propiedad', 'descripcion', 'precio', 'ubicacion', 'superficie', 'dimensiones', 'tipo_propiedad', 'estado'].includes(key)) {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        if (fields.length === 0) {
            throw new Error('No hay campos válidos para actualizar');
        }

        // Agregar fecha de modificación y el ID
        fields.push(`fecha_modificacion = CURRENT_TIMESTAMP`);
        values.push(id);

        const query = `
            UPDATE Propiedad
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Borrado lógico de propiedad
    async softDelete(id) {
        const query = `
            UPDATE Propiedad
            SET estado = 0, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }
}

module.exports = PropertyModel;