// servidor/modulo-backend/src/services/fileService.js

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class FileService {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        
        // Mapeo de tipos de archivo a IDs de base de datos
        this.fileTypeMapping = {
            'image': 1,      // Imagen
            'video': 2,      // Video  
            'document': 3,   // Documento
            'audio': 4,      // Audio
            'other': 5       // Otro
        };
        
        // Configuración de rutas
        this.paths = {
            pdfs: path.resolve(__dirname, '../../../modulo-ia/data/pdfs'),
            docs: path.resolve(__dirname, '../../../modulo-ia/data/docs'),
            images: path.resolve(__dirname, '../../files/images'),
            videos: path.resolve(__dirname, '../../files/videos'),
            others: path.resolve(__dirname, '../../files/others')
        };
    }

    // Generar nombre único para archivo
    generateUniqueFileName(originalName, propertyId) {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        const extension = path.extname(originalName);
        const baseName = path.basename(originalName, extension).substring(0, 20);
        
        return `prop_${propertyId}_${timestamp}_${random}_${baseName}${extension}`;
    }

    // Determinar categoría de archivo
    getFileCategory(mimeType, fileName) {
        const mime = (mimeType || '').toLowerCase();
        const name = (fileName || '').toLowerCase();
        
        if (mime.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) {
            return 'image';
        } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
            return 'pdf';
        } else if (name.match(/\.(doc|docx)$/)) {
            return 'word';
        } else if (mime.startsWith('video/') || name.match(/\.(mp4|avi|mov|wmv|flv|webm)$/)) {
            return 'video';
        } else if (name.match(/\.(txt|rtf|odt|xlsx|xls|ppt|pptx)$/)) {
            return 'document';
        } else if (mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|m4a)$/)) {
            return 'audio';
        } else {
            return 'other';
        }
    }

    // Obtener ruta de destino según categoría
    getDestinationPath(category) {
        switch (category) {
            case 'pdf':
                return this.paths.pdfs;
            case 'word':
                return this.paths.docs;
            case 'image':
                return this.paths.images;
            case 'video':
                return this.paths.videos;
            case 'audio':
            case 'document':
            case 'other':
            default:
                return this.paths.others;
        }
    }

    // Obtener URL relativa según categoría
    getRelativeUrl(category, fileName) {
        switch (category) {
            case 'pdf':
                return `/modulo-ia/data/pdfs/${fileName}`;
            case 'word':
                return `/modulo-ia/data/docs/${fileName}`;
            case 'image':
                return `/files/images/${fileName}`;
            case 'video':
                return `/files/videos/${fileName}`;
            case 'audio':
            case 'document':
            case 'other':
            default:
                return `/files/others/${fileName}`;
        }
    }

    // Obtener tipo de archivo para BD
    getFileTypeId(category) {
        switch (category) {
            case 'image':
                return this.fileTypeMapping.image;
            case 'video':
                return this.fileTypeMapping.video;
            case 'pdf':
            case 'word':
            case 'document':
                return this.fileTypeMapping.document;
            case 'audio':
                return this.fileTypeMapping.audio;
            default:
                return this.fileTypeMapping.other;
        }
    }

    // Asegurar que los directorios existan
    async ensureDirectoriesExist() {
        for (const [key, dirPath] of Object.entries(this.paths)) {
            try {
                await fs.mkdir(dirPath, { recursive: true });
                console.log(`📁 Directorio asegurado: ${dirPath}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    console.error(`❌ Error creando directorio ${dirPath}:`, error.message);
                    throw error;
                }
            }
        }
    }

    // Guardar archivo físicamente
    async saveFilePhysically(fileBuffer, fileName, category, propertyId) {
        try {
            // Asegurar directorios
            await this.ensureDirectoriesExist();
            
            // ✅ NUEVO: Reconstruir buffer si viene serializado desde HTTP
            let actualBuffer;
            if (fileBuffer && typeof fileBuffer === 'object' && fileBuffer.type === 'Buffer') {
                // Buffer serializado: {type: 'Buffer', data: [1,2,3...]}
                actualBuffer = Buffer.from(fileBuffer.data);
                console.log(`🔧 Buffer reconstruido desde serialización HTTP`);
            } else if (Buffer.isBuffer(fileBuffer)) {
                // Buffer válido
                actualBuffer = fileBuffer;
            } else {
                throw new Error(`Formato de buffer inválido: ${typeof fileBuffer}`);
            }
            
            // Generar nombre único
            const uniqueFileName = this.generateUniqueFileName(fileName, propertyId);
            
            // Obtener ruta de destino
            const destinationPath = this.getDestinationPath(category);
            const fullFilePath = path.join(destinationPath, uniqueFileName);
            
            // Guardar archivo
            await fs.writeFile(fullFilePath, actualBuffer);
            
            console.log(`💾 Archivo guardado: ${fullFilePath}`);
            
            return {
                fileName: uniqueFileName,
                originalName: fileName,
                fullPath: fullFilePath,
                relativePath: this.getRelativeUrl(category, uniqueFileName),
                category: category,
                size: fileBuffer.length
            };
            
        } catch (error) {
            console.error(`❌ Error guardando archivo ${fileName}:`, error.message);
            throw new Error(`Error guardando archivo: ${error.message}`);
        }
    }

    // Guardar información en base de datos
    async saveFileToDatabase(propertyId, fileInfo) {
        try {
            const fileRecord = {
                propiedad_id: propertyId,
                tipo_archivo_id: this.getFileTypeId(fileInfo.category),
                nombre_archivo: fileInfo.originalName,
                url: fileInfo.relativePath
            };

            const response = await axios.post(`${this.databaseUrl}/api/property-files`, fileRecord, {
                timeout: 10000
            });

            if (response.data.success) {
                console.log(`💾 Archivo registrado en BD: ${fileInfo.originalName}`);
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error guardando en base de datos');
            }

        } catch (error) {
            console.error(`❌ Error guardando en BD archivo ${fileInfo.originalName}:`, error.message);
            throw new Error(`Error guardando en BD: ${error.message}`);
        }
    }

    // Procesar archivo completo (físico + BD)
    async processFile(fileBuffer, fileName, mimeType, propertyId) {
        try {
            console.log(`📁 Procesando archivo: ${fileName} para propiedad ${propertyId}`);
            
            // Determinar categoría
            const category = this.getFileCategory(mimeType, fileName);
            console.log(`📋 Categoría detectada: ${category}`);
            
            // Guardar físicamente
            const fileInfo = await this.saveFilePhysically(fileBuffer, fileName, category, propertyId);
            
            // Guardar en base de datos
            const dbRecord = await this.saveFileToDatabase(propertyId, fileInfo);
            
            return {
                ...fileInfo,
                dbId: dbRecord.id,
                typeId: this.getFileTypeId(category),
                success: true
            };
            
        } catch (error) {
            console.error(`❌ Error procesando archivo ${fileName}:`, error.message);
            throw error;
        }
    }

    // Procesar múltiples archivos
    async processMultipleFiles(filesData, propertyId) {
        try {
            console.log(`📁 Procesando ${filesData.length} archivo(s) para propiedad ${propertyId}`);
            
            const results = {
                successful: [],
                failed: [],
                summary: {
                    total: filesData.length,
                    success: 0,
                    errors: 0,
                    categories: {}
                }
            };

            for (const fileData of filesData) {
                try {
                    const result = await this.processFile(
                        fileData.buffer,
                        fileData.fileName,
                        fileData.mimeType,
                        propertyId
                    );
                    
                    results.successful.push(result);
                    results.summary.success++;
                    
                    // Contar por categoría
                    const cat = result.category;
                    results.summary.categories[cat] = (results.summary.categories[cat] || 0) + 1;
                    
                } catch (error) {
                    results.failed.push({
                        fileName: fileData.fileName,
                        error: error.message
                    });
                    results.summary.errors++;
                }
            }

            console.log(`✅ Procesamiento completo: ${results.summary.success} éxitos, ${results.summary.errors} errores`);
            
            return results;
            
        } catch (error) {
            console.error(`❌ Error procesando archivos múltiples:`, error.message);
            throw error;
        }
    }

    // Obtener archivos de una propiedad
    async getPropertyFiles(propertyId) {
        try {
            const response = await axios.get(`${this.databaseUrl}/api/property-files/property/${propertyId}`, {
                timeout: 10000
            });

            if (response.data.success) {
                return response.data.data;
            } else {
                throw new Error(response.data.error || 'Error obteniendo archivos');
            }

        } catch (error) {
            console.error(`❌ Error obteniendo archivos de propiedad ${propertyId}:`, error.message);
            throw error;
        }
    }
}

module.exports = FileService;