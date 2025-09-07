class PropertyModel {
    constructor(client) {
        this.client = client;
    }

    // Crear propiedad
    async create(propertyData) {
        const query = `
            INSERT INTO Propiedad (usuario_id, tipo_propiedad_id, tipo_operacion_id, 
                                   estado_propiedad_id, nombre_propiedad, descripcion, 
                                   precio_venta, precio_alquiler, ubicacion, superficie, 
                                   dimensiones, estado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;
        const values = [
            propertyData.usuario_id,
            propertyData.tipo_propiedad_id,
            propertyData.tipo_operacion_id,
            propertyData.estado_propiedad_id || 1, // Default: Disponible
            propertyData.nombre_propiedad,
            propertyData.descripcion || null,
            propertyData.precio_venta || null,
            propertyData.precio_alquiler || null,
            propertyData.ubicacion,
            propertyData.superficie || null,
            propertyData.dimensiones || null,
            propertyData.estado || 1
        ];
        const result = await this.client.query(query, values);
        return result.rows[0];
    }

    // Buscar TODAS las propiedades del sistema (sin filtros)
    async findAll() {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.estado = 1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Buscar MIS propiedades (por usuario_id)
    async findByUserId(usuario_id) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.estado = 1 AND p.usuario_id = $1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [usuario_id]);
        return result.rows;
    }

    // Buscar propiedades por PRECIO MÁXIMO
    async findByMaxPrice(precio_max) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.estado = 1 AND (p.precio_venta <= $1 OR p.precio_alquiler <= $1)
            ORDER BY COALESCE(p.precio_venta, p.precio_alquiler) ASC
        `;
        const result = await this.client.query(query, [precio_max]);
        return result.rows;
    }

    // Buscar propiedades por UBICACIÓN
    async findByLocation(ubicacion) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.estado = 1 AND p.ubicacion ILIKE $1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [`%${ubicacion}%`]);
        return result.rows;
    }

    // Buscar propiedades por TIPO
    async findByType(tipo_propiedad) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.estado = 1 AND tp.nombre ILIKE $1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [`%${tipo_propiedad}%`]);
        return result.rows;
    }

    // Buscar propiedades con MÚLTIPLES FILTROS (búsqueda personalizada)
    async findByMultipleFilters(filters) {
        let query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE 1=1
        `;
        const values = [];
        let paramCount = 1;

        // Filtro por estado (muy importante para propiedades eliminadas)
        if (filters.estado !== undefined) {
            query += ` AND p.estado = $${paramCount}`;
            values.push(filters.estado);
            paramCount++;
        } else {
            // Si no se especifica estado, por defecto mostrar solo activas
            query += ` AND p.estado = 1`;
        }

        // Filtro por usuario_id (mis propiedades)
        if (filters.usuario_id) {
            query += ` AND p.usuario_id = $${paramCount}`;
            values.push(filters.usuario_id);
            paramCount++;
        }

        if (filters.precio_max) {
            query += ` AND (p.precio_venta <= $${paramCount} OR p.precio_alquiler <= $${paramCount})`;
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

        query += ` ORDER BY p.fecha_creacion DESC`;

        console.log('🔍 Query final:', query);
        console.log('🔍 Valores:', values);

        const result = await this.client.query(query, values);
        return result.rows;
    }

    // Obtener propiedad por ID (solo activas)
    async findById(id) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.id = $1 AND p.estado = 1
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Obtener propiedad por ID (cualquier estado)
    async findByIdAnyStatus(id) {
        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE p.id = $1
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
        const validFields = ['nombre_propiedad', 'descripcion', 'precio_venta', 'precio_alquiler', 'ubicacion', 
                             'superficie', 'dimensiones', 'tipo_propiedad_id', 'tipo_operacion_id', 
                             'estado_propiedad_id', 'estado'];
        
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && validFields.includes(key)) {
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

    // Obtener todos los tipos de propiedad activos
    async getAllPropertyTypes() {
        const query = `
            SELECT id, nombre 
            FROM TipoPropiedad 
            ORDER BY nombre ASC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Obtener todos los estados de propiedad activos
    async getAllPropertyStates() {
        const query = `
            SELECT id, nombre 
            FROM EstadoPropiedad 
            ORDER BY nombre ASC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Buscar tipo de propiedad por ID
    async findPropertyTypeById(id) {
        const query = `
            SELECT id, nombre 
            FROM TipoPropiedad 
            WHERE id = $1
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Buscar estado de propiedad por ID
    async findPropertyStateById(id) {
        const query = `
            SELECT id, nombre 
            FROM EstadoPropiedad 
            WHERE id = $1
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Obtener todos los tipos de operación activos
    async getAllOperationTypes() {
        const query = `
            SELECT id, nombre 
            FROM TipoOperacion 
            ORDER BY nombre ASC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Buscar tipo de operación por ID
    async findOperationTypeById(id) {
        const query = `
            SELECT id, nombre 
            FROM TipoOperacion 
            WHERE id = $1
        `;
        const result = await this.client.query(query, [id]);
        return result.rows[0];
    }

    // Obtener todos los tipos de archivo
    async getAllFileTypes() {
        const query = `
            SELECT id, nombre 
            FROM TipoArchivo 
            ORDER BY nombre ASC
        `;
        const result = await this.client.query(query);
        return result.rows;
    }

    // Búsqueda avanzada con filtros
    async findWithFilters(filters) {
        let whereConditions = ['p.estado = 1'];
        let params = [];
        let paramCount = 1;

        // Construir condiciones dinámicamente
        if (filters.tipo_propiedad_id) {
            whereConditions.push(`p.tipo_propiedad_id = $${paramCount}`);
            params.push(filters.tipo_propiedad_id);
            paramCount++;
        }

        if (filters.tipo_operacion_id) {
            whereConditions.push(`p.tipo_operacion_id = $${paramCount}`);
            params.push(filters.tipo_operacion_id);
            paramCount++;
        }

        if (filters.estado_propiedad_id) {
            whereConditions.push(`p.estado_propiedad_id = $${paramCount}`);
            params.push(filters.estado_propiedad_id);
            paramCount++;
        }

        if (filters.precio_min) {
            whereConditions.push(`(p.precio_venta >= $${paramCount} OR p.precio_alquiler >= $${paramCount})`);
            params.push(filters.precio_min);
            paramCount++;
        }

        if (filters.precio_max) {
            whereConditions.push(`(p.precio_venta <= $${paramCount} OR p.precio_alquiler <= $${paramCount})`);
            params.push(filters.precio_max);
            paramCount++;
        }

        if (filters.usuario_id) {
            whereConditions.push(`p.usuario_id = $${paramCount}`);
            params.push(filters.usuario_id);
            paramCount++;
        }

        const query = `
            SELECT p.*, u.nombre as agente_nombre, u.apellido as agente_apellido,
                   tp.nombre as tipo_propiedad_nombre,
                   top.nombre as tipo_operacion_nombre,
                   ep.nombre as estado_propiedad_nombre
            FROM Propiedad p 
            JOIN Usuario u ON p.usuario_id = u.id
            LEFT JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            LEFT JOIN TipoOperacion top ON p.tipo_operacion_id = top.id
            LEFT JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY p.fecha_creacion DESC
            LIMIT ${filters.limit || 50}
        `;

        const result = await this.client.query(query, params);
        return result.rows;
    }

    // Cambiar estado de la propiedad (activar/desactivar)
    async toggleStatus(id) {
        // Primero obtener estado actual
        const currentQuery = `SELECT estado FROM Propiedad WHERE id = $1`;
        const currentResult = await this.client.query(currentQuery, [id]);
        
        if (currentResult.rows.length === 0) {
            throw new Error('Propiedad no encontrada');
        }

        const currentStatus = currentResult.rows[0].estado;
        const newStatus = currentStatus === 1 ? 0 : 1;

        const query = `
            UPDATE Propiedad
            SET estado = $1, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        const result = await this.client.query(query, [newStatus, id]);
        return result.rows[0];
    }


    // Buscar propiedades por tipo de operación
    async findByOperationType(tipoOperacionId) {
        const query = `
            SELECT p.*, 
                   tp.nombre as tipo_propiedad_nombre,
                   ep.nombre as estado_propiedad_nombre,
                   toper.nombre as tipo_operacion_nombre,
                   u.nombre as agente_nombre,
                   u.apellido as agente_apellido
            FROM Propiedad p
            JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            JOIN TipoOperacion toper ON p.tipo_operacion_id = toper.id
            JOIN Usuario u ON p.usuario_id = u.id
            WHERE p.tipo_operacion_id = $1 AND p.estado = 1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [tipoOperacionId]);
        return result.rows;
    }

    // Buscar propiedades por tipo de propiedad
    async findByPropertyType(tipoPropiedad) {
        const query = `
            SELECT p.*, 
                   tp.nombre as tipo_propiedad_nombre,
                   ep.nombre as estado_propiedad_nombre,
                   toper.nombre as tipo_operacion_nombre,
                   u.nombre as agente_nombre,
                   u.apellido as agente_apellido
            FROM Propiedad p
            JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            JOIN TipoOperacion toper ON p.tipo_operacion_id = toper.id
            JOIN Usuario u ON p.usuario_id = u.id
            WHERE tp.nombre ILIKE $1 AND p.estado = 1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [`%${tipoPropiedad}%`]);
        return result.rows;
    }

    // Buscar propiedades por estado de propiedad
    async findByPropertyStatus(estadoPropiedad) {
        const query = `
            SELECT p.*, 
                   tp.nombre as tipo_propiedad_nombre,
                   ep.nombre as estado_propiedad_nombre,
                   toper.nombre as tipo_operacion_nombre,
                   u.nombre as agente_nombre,
                   u.apellido as agente_apellido
            FROM Propiedad p
            JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            JOIN TipoOperacion toper ON p.tipo_operacion_id = toper.id
            JOIN Usuario u ON p.usuario_id = u.id
            WHERE ep.nombre ILIKE $1 AND p.estado = 1
            ORDER BY p.fecha_creacion DESC
        `;
        const result = await this.client.query(query, [`%${estadoPropiedad}%`]);
        return result.rows;
    }

    // Función auxiliar para obtener el precio formateado según el tipo de operación
    static formatPriceByOperationType(property) {
        if (!property.tipo_operacion_nombre) {
            return 'Precio no disponible';
        }

        const tipoOperacion = property.tipo_operacion_nombre.toLowerCase();
        let priceText = '';

        if (tipoOperacion === 'venta') {
            priceText = property.precio_venta ? 
                `💰 $${Number(property.precio_venta).toLocaleString()} Bs` : 
                'Precio de venta no disponible';
        } else if (tipoOperacion === 'alquiler') {
            priceText = property.precio_alquiler ? 
                `🏠 $${Number(property.precio_alquiler).toLocaleString()} Bs/mes` : 
                'Precio de alquiler no disponible';
        } else if (tipoOperacion === 'venta y alquiler') {
            const venta = property.precio_venta ? 
                `Venta: $${Number(property.precio_venta).toLocaleString()} Bs` : null;
            const alquiler = property.precio_alquiler ? 
                `Alquiler: $${Number(property.precio_alquiler).toLocaleString()} Bs/mes` : null;
            
            const precios = [venta, alquiler].filter(p => p !== null);
            priceText = precios.length > 0 ? 
                `💰 ${precios.join(' | ')}` : 
                'Precios no disponibles';
        }

        return priceText;
    }

    // Función auxiliar para validar precios requeridos según tipo de operación
    static validatePricesByOperationType(propertyData) {
        const tipoOperacionId = propertyData.tipo_operacion_id;
        const errors = [];

        // Obtener el nombre del tipo de operación (asumiendo que viene en propertyData)
        if (tipoOperacionId === 1) { // Venta
            if (!propertyData.precio_venta || propertyData.precio_venta <= 0) {
                errors.push('Precio de venta es requerido para propiedades en venta');
            }
        } else if (tipoOperacionId === 2) { // Alquiler
            if (!propertyData.precio_alquiler || propertyData.precio_alquiler <= 0) {
                errors.push('Precio de alquiler es requerido para propiedades en alquiler');
            }
        } else if (tipoOperacionId === 3) { // Venta y Alquiler
            if ((!propertyData.precio_venta || propertyData.precio_venta <= 0) && 
                (!propertyData.precio_alquiler || propertyData.precio_alquiler <= 0)) {
                errors.push('Al menos un precio (venta o alquiler) es requerido para propiedades de venta y alquiler');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

module.exports = PropertyModel;