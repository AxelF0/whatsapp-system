class PropertyService {
    constructor(propertyModel) {
        this.propertyModel = propertyModel;
    }

    async createProperty(propertyData) {
        // Validar datos requeridos
        if (!propertyData.usuario_id || !propertyData.nombre_propiedad || !propertyData.precio) {
            throw new Error('Faltan datos requeridos: usuario_id, nombre_propiedad, precio');
        }

        // Validar que el precio sea válido
        if (propertyData.precio <= 0) {
            throw new Error('El precio debe ser mayor a 0');
        }

        return await this.propertyModel.create(propertyData);
    }

    async searchProperties(filters = {}) {
        // Limpiar filtros vacíos
        const cleanFilters = {};
        
        if (filters.precio_min && !isNaN(filters.precio_min)) {
            cleanFilters.precio_min = parseFloat(filters.precio_min);
        }
        
        if (filters.precio_max && !isNaN(filters.precio_max)) {
            cleanFilters.precio_max = parseFloat(filters.precio_max);
        }
        
        if (filters.ubicacion && filters.ubicacion.trim()) {
            cleanFilters.ubicacion = filters.ubicacion.trim();
        }
        
        if (filters.tipo_propiedad && filters.tipo_propiedad.trim()) {
            cleanFilters.tipo_propiedad = filters.tipo_propiedad.trim();
        }
        
        if (filters.dormitorios && !isNaN(filters.dormitorios)) {
            cleanFilters.dormitorios = parseInt(filters.dormitorios);
        }

        return await this.propertyModel.findByFilters(cleanFilters);
    }

    async getPropertyById(id) {
        if (!id || isNaN(id)) {
            throw new Error('ID de propiedad válido requerido');
        }
        return await this.propertyModel.findById(id);
    }

    async addPropertyFile(propertyId, fileData) {
        if (!propertyId || !fileData.url || !fileData.tipo_archivo) {
            throw new Error('Faltan datos requeridos: propertyId, url, tipo_archivo');
        }

        // Validar tipo de archivo
        const validTypes = ['image', 'video', 'document'];
        if (!validTypes.includes(fileData.tipo_archivo)) {
            throw new Error('Tipo de archivo inválido. Debe ser: image, video, document');
        }

        return await this.propertyModel.addFile(propertyId, fileData);
    }

    async deleteProperty(id) {
        if (!id || isNaN(id)) {
            throw new Error('ID de propiedad válido requerido');
        }
        const deleted = await this.propertyModel.softDelete(id);
        if (!deleted) {
            throw new Error('Propiedad no encontrada');
        }
        return deleted;
    }
}

module.exports = PropertyService;