// servidor/modulo-base-datos/src/models/postgresql/propertyFileModel.js

class PropertyFileModel {
    constructor(pgClient) {
        this.client = pgClient;
    }

    // Crear nuevo archivo de propiedad
    async create(propertyFileData) {
        const query = `
            INSERT INTO Propiedad_archivo (propiedad_id, tipo_archivo_id, nombre_archivo, url)
            VALUES ($1, $2, $3, $4)
            RETURNING id, propiedad_id, tipo_archivo_id, nombre_archivo, url, estado, fecha_creacion, fecha_modificacion
        `;
        
        const values = [
            propertyFileData.propiedad_id,
            propertyFileData.tipo_archivo_id,
            propertyFileData.nombre_archivo,
            propertyFileData.url
        ];

        try {
            const result = await this.client.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error creando archivo de propiedad:', error.message);
            throw error;
        }
    }

    // Obtener archivos por ID de propiedad
    async getByPropertyId(propertyId) {
        const query = `
            SELECT 
                pa.id,
                pa.propiedad_id,
                pa.tipo_archivo_id,
                ta.nombre as tipo_archivo,
                pa.nombre_archivo,
                pa.url,
                pa.estado,
                pa.fecha_creacion,
                pa.fecha_modificacion
            FROM Propiedad_archivo pa
            JOIN TipoArchivo ta ON pa.tipo_archivo_id = ta.id
            WHERE pa.propiedad_id = $1 AND pa.estado = 1
            ORDER BY pa.fecha_creacion DESC
        `;

        try {
            const result = await this.client.query(query, [propertyId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error obteniendo archivos de propiedad:', error.message);
            throw error;
        }
    }

    // Obtener archivo por ID
    async getById(fileId) {
        const query = `
            SELECT 
                pa.id,
                pa.propiedad_id,
                pa.tipo_archivo_id,
                ta.nombre as tipo_archivo,
                pa.nombre_archivo,
                pa.url,
                pa.estado,
                pa.fecha_creacion,
                pa.fecha_modificacion
            FROM Propiedad_archivo pa
            JOIN TipoArchivo ta ON pa.tipo_archivo_id = ta.id
            WHERE pa.id = $1
        `;

        try {
            const result = await this.client.query(query, [fileId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error obteniendo archivo por ID:', error.message);
            throw error;
        }
    }

    // Actualizar archivo
    async update(fileId, updateData) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        // Campos actualizables
        const allowedFields = ['nombre_archivo', 'url', 'estado'];
        
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                fields.push(`${field} = $${paramCount}`);
                values.push(updateData[field]);
                paramCount++;
            }
        }

        if (fields.length === 0) {
            throw new Error('No hay campos para actualizar');
        }

        // Siempre actualizar fecha de modificación
        fields.push(`fecha_modificacion = CURRENT_TIMESTAMP`);

        const query = `
            UPDATE Propiedad_archivo 
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, propiedad_id, tipo_archivo_id, nombre_archivo, url, estado, fecha_creacion, fecha_modificacion
        `;
        
        values.push(fileId);

        try {
            const result = await this.client.query(query, values);
            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error actualizando archivo:', error.message);
            throw error;
        }
    }

    // Eliminar archivo (soft delete)
    async delete(fileId) {
        const query = `
            UPDATE Propiedad_archivo 
            SET estado = 0, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id
        `;

        try {
            const result = await this.client.query(query, [fileId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error eliminando archivo:', error.message);
            throw error;
        }
    }

    // Obtener estadísticas de archivos por propiedad
    async getStatsByProperty(propertyId) {
        const query = `
            SELECT 
                ta.nombre as tipo_archivo,
                COUNT(*) as cantidad
            FROM Propiedad_archivo pa
            JOIN TipoArchivo ta ON pa.tipo_archivo_id = ta.id
            WHERE pa.propiedad_id = $1 AND pa.estado = 1
            GROUP BY ta.id, ta.nombre
            ORDER BY cantidad DESC
        `;

        try {
            const result = await this.client.query(query, [propertyId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de archivos:', error.message);
            throw error;
        }
    }

    // Obtener todos los tipos de archivo disponibles
    async getFileTypes() {
        const query = 'SELECT id, nombre FROM TipoArchivo ORDER BY id';

        try {
            const result = await this.client.query(query);
            return result.rows;
        } catch (error) {
            console.error('❌ Error obteniendo tipos de archivo:', error.message);
            throw error;
        }
    }
}

module.exports = PropertyFileModel;