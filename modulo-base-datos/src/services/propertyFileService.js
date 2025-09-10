// servidor/modulo-base-datos/src/services/propertyFileService.js

class PropertyFileService {
    constructor(propertyFileModel) {
        this.propertyFileModel = propertyFileModel;
    }

    // Crear nuevo archivo de propiedad
    async createPropertyFile(propertyFileData) {
        try {
            // Validar datos requeridos
            if (!propertyFileData.propiedad_id) {
                throw new Error('ID de propiedad es requerido');
            }
            if (!propertyFileData.tipo_archivo_id) {
                throw new Error('Tipo de archivo es requerido');
            }
            if (!propertyFileData.nombre_archivo) {
                throw new Error('Nombre de archivo es requerido');
            }
            if (!propertyFileData.url) {
                throw new Error('URL de archivo es requerida');
            }

            console.log(`📁 Creando archivo de propiedad: ${propertyFileData.nombre_archivo} para propiedad ${propertyFileData.propiedad_id}`);
            
            const newFile = await this.propertyFileModel.create(propertyFileData);
            
            console.log(`✅ Archivo creado exitosamente con ID: ${newFile.id}`);
            return newFile;
            
        } catch (error) {
            console.error('❌ Error en servicio al crear archivo de propiedad:', error.message);
            throw error;
        }
    }

    // Obtener archivos por ID de propiedad
    async getFilesByPropertyId(propertyId) {
        try {
            if (!propertyId) {
                throw new Error('ID de propiedad es requerido');
            }

            console.log(`📋 Obteniendo archivos para propiedad ID: ${propertyId}`);
            
            const files = await this.propertyFileModel.getByPropertyId(propertyId);
            
            console.log(`✅ Encontrados ${files.length} archivo(s) para propiedad ${propertyId}`);
            return files;
            
        } catch (error) {
            console.error('❌ Error en servicio al obtener archivos de propiedad:', error.message);
            throw error;
        }
    }

    // Obtener archivo por ID
    async getFileById(fileId) {
        try {
            if (!fileId) {
                throw new Error('ID de archivo es requerido');
            }

            console.log(`📄 Obteniendo archivo ID: ${fileId}`);
            
            const file = await this.propertyFileModel.getById(fileId);
            
            if (!file) {
                throw new Error(`Archivo con ID ${fileId} no encontrado`);
            }
            
            console.log(`✅ Archivo encontrado: ${file.nombre_archivo}`);
            return file;
            
        } catch (error) {
            console.error('❌ Error en servicio al obtener archivo:', error.message);
            throw error;
        }
    }

    // Actualizar archivo
    async updateFile(fileId, updateData) {
        try {
            if (!fileId) {
                throw new Error('ID de archivo es requerido');
            }

            // Verificar que el archivo existe
            const existingFile = await this.propertyFileModel.getById(fileId);
            if (!existingFile) {
                throw new Error(`Archivo con ID ${fileId} no encontrado`);
            }

            console.log(`📝 Actualizando archivo ID: ${fileId}`);
            
            const updatedFile = await this.propertyFileModel.update(fileId, updateData);
            
            console.log(`✅ Archivo actualizado exitosamente`);
            return updatedFile;
            
        } catch (error) {
            console.error('❌ Error en servicio al actualizar archivo:', error.message);
            throw error;
        }
    }

    // Eliminar archivo (soft delete)
    async deleteFile(fileId) {
        try {
            if (!fileId) {
                throw new Error('ID de archivo es requerido');
            }

            // Verificar que el archivo existe
            const existingFile = await this.propertyFileModel.getById(fileId);
            if (!existingFile) {
                throw new Error(`Archivo con ID ${fileId} no encontrado`);
            }

            console.log(`🗑️ Eliminando archivo ID: ${fileId} (${existingFile.nombre_archivo})`);
            
            const deletedFile = await this.propertyFileModel.delete(fileId);
            
            console.log(`✅ Archivo eliminado exitosamente`);
            return deletedFile;
            
        } catch (error) {
            console.error('❌ Error en servicio al eliminar archivo:', error.message);
            throw error;
        }
    }

    // Obtener estadísticas de archivos por propiedad
    async getFileStatsByProperty(propertyId) {
        try {
            if (!propertyId) {
                throw new Error('ID de propiedad es requerido');
            }

            console.log(`📊 Obteniendo estadísticas de archivos para propiedad ID: ${propertyId}`);
            
            const stats = await this.propertyFileModel.getStatsByProperty(propertyId);
            
            console.log(`✅ Estadísticas obtenidas: ${stats.length} tipos de archivo`);
            return stats;
            
        } catch (error) {
            console.error('❌ Error en servicio al obtener estadísticas:', error.message);
            throw error;
        }
    }

    // Obtener todos los tipos de archivo disponibles
    async getFileTypes() {
        try {
            console.log(`📋 Obteniendo tipos de archivo disponibles`);
            
            const fileTypes = await this.propertyFileModel.getFileTypes();
            
            console.log(`✅ Encontrados ${fileTypes.length} tipos de archivo`);
            return fileTypes;
            
        } catch (error) {
            console.error('❌ Error en servicio al obtener tipos de archivo:', error.message);
            throw error;
        }
    }

    // Validar que un archivo pertenece a una propiedad
    async validateFileOwnership(fileId, propertyId) {
        try {
            const file = await this.propertyFileModel.getById(fileId);
            
            if (!file) {
                return false;
            }
            
            return file.propiedad_id == propertyId;
            
        } catch (error) {
            console.error('❌ Error validando propiedad del archivo:', error.message);
            return false;
        }
    }

    // Contar archivos por propiedad
    async countFilesByProperty(propertyId) {
        try {
            const files = await this.propertyFileModel.getByPropertyId(propertyId);
            return files.length;
        } catch (error) {
            console.error('❌ Error contando archivos:', error.message);
            return 0;
        }
    }
}

module.exports = PropertyFileService;