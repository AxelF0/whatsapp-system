// servidor/modulo-respuestas/src/services/fileService.js

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

class FileService {
    constructor() {
        this.uploadDir = path.join(__dirname, '../../uploads');
        this.fileRegistry = new Map(); // fileId -> fileData
        this.maxFileAge = 24 * 60 * 60 * 1000; // 24 horas
    }

    // Procesar archivo subido
    async processUploadedFile(file) {
        console.log('📁 Procesando archivo:', file.originalname);

        try {
            // Generar ID único
            const fileId = this.generateFileId();

            // Determinar tipo de archivo
            const fileType = this.getFileType(file.mimetype);

            // Crear registro del archivo
            const fileData = {
                id: fileId,
                originalName: file.originalname,
                filename: file.filename,
                path: file.path,
                url: `/uploads/${fileType}/${file.filename}`,
                size: file.size,
                mimeType: file.mimetype,
                type: fileType,
                uploadedAt: new Date()
            };

            // Si es imagen, obtener dimensiones y crear thumbnail
            if (fileType === 'image') {
                const metadata = await this.getImageMetadata(file.path);
                fileData.dimensions = metadata;

                // Crear thumbnail si la imagen es grande
                if (file.size > 500000) { // > 500KB
                    const thumbnailPath = await this.createThumbnail(file.path);
                    fileData.thumbnailUrl = `/uploads/thumbnails/${path.basename(thumbnailPath)}`;
                }
            }

            // Registrar archivo
            this.fileRegistry.set(fileId, fileData);

            console.log('✅ Archivo procesado:', fileId);

            return fileData;

        } catch (error) {
            console.error('❌ Error procesando archivo:', error.message);
            
            // Intentar eliminar archivo si hubo error
            try {
                await fs.unlink(file.path);
            } catch (unlinkError) {
                console.error('⚠️ No se pudo eliminar archivo corrupto');
            }

            throw error;
        }
    }

    // Obtener archivo por ID
    async getFile(fileId) {
        const fileData = this.fileRegistry.get(fileId);

        if (!fileData) {
            // Intentar buscar en el sistema de archivos
            return await this.findFileInSystem(fileId);
        }

        // Verificar que el archivo aún existe
        try {
            await fs.access(fileData.path);
            return fileData;
        } catch (error) {
            console.error('⚠️ Archivo no encontrado en sistema:', fileData.path);
            this.fileRegistry.delete(fileId);
            return null;
        }
    }

    // Obtener archivo desde path
    async getFileFromPath(filePath) {
        try {
            // Verificar si es URL o path local
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                return {
                    url: filePath,
                    type: 'external',
                    isExternal: true
                };
            }

            // Resolver path absoluto
            const absolutePath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.uploadDir, filePath);

            // Verificar que existe
            const stats = await fs.stat(absolutePath);

            if (!stats.isFile()) {
                throw new Error('Path no es un archivo válido');
            }

            // Determinar tipo
            const ext = path.extname(absolutePath).toLowerCase();
            const mimeType = this.getMimeTypeFromExtension(ext);

            return {
                path: absolutePath,
                url: `/uploads/${path.basename(absolutePath)}`,
                size: stats.size,
                mimeType: mimeType,
                type: this.getFileType(mimeType)
            };

        } catch (error) {
            console.error('❌ Error obteniendo archivo desde path:', error.message);
            throw error;
        }
    }

    // Optimizar imagen
    async optimizeImage(imageData) {
        console.log('🔧 Optimizando imagen:', imageData.originalName || 'sin nombre');

        try {
            const outputPath = path.join(
                this.uploadDir, 
                'optimized',
                `opt_${Date.now()}_${path.basename(imageData.path)}`
            );

            // Asegurar que el directorio existe
            await fs.mkdir(path.dirname(outputPath), { recursive: true });

            // Optimizar con sharp
            await sharp(imageData.path)
                .resize(1920, 1080, { 
                    fit: 'inside',
                    withoutEnlargement: true 
                })
                .jpeg({ 
                    quality: 85,
                    progressive: true 
                })
                .toFile(outputPath);

            // Obtener tamaño del archivo optimizado
            const stats = await fs.stat(outputPath);

            console.log(`✅ Imagen optimizada: ${imageData.size} bytes → ${stats.size} bytes`);

            return {
                ...imageData,
                path: outputPath,
                url: `/uploads/optimized/${path.basename(outputPath)}`,
                size: stats.size,
                optimized: true,
                originalSize: imageData.size
            };

        } catch (error) {
            console.error('❌ Error optimizando imagen:', error.message);
            // Retornar imagen original si falla la optimización
            return imageData;
        }
    }

    // Crear thumbnail
    async createThumbnail(imagePath) {
        const thumbnailDir = path.join(this.uploadDir, 'thumbnails');
        await fs.mkdir(thumbnailDir, { recursive: true });

        const thumbnailPath = path.join(
            thumbnailDir,
            `thumb_${path.basename(imagePath)}`
        );

        await sharp(imagePath)
            .resize(200, 200, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 70 })
            .toFile(thumbnailPath);

        return thumbnailPath;
    }

    // Obtener metadata de imagen
    async getImageMetadata(imagePath) {
        try {
            const metadata = await sharp(imagePath).metadata();
            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                hasAlpha: metadata.hasAlpha,
                orientation: metadata.orientation
            };
        } catch (error) {
            console.error('⚠️ Error obteniendo metadata:', error.message);
            return null;
        }
    }

    // Limpiar archivos antiguos
    async cleanupOldFiles() {
        console.log('🧹 Limpiando archivos antiguos...');

        const now = Date.now();
        let deletedCount = 0;

        // Limpiar del registro
        for (const [fileId, fileData] of this.fileRegistry.entries()) {
            const age = now - new Date(fileData.uploadedAt).getTime();
            
            if (age > this.maxFileAge) {
                try {
                    await fs.unlink(fileData.path);
                    this.fileRegistry.delete(fileId);
                    deletedCount++;
                } catch (error) {
                    console.error(`⚠️ Error eliminando archivo ${fileId}:`, error.message);
                }
            }
        }

        // Limpiar directorio de uploads
        const directories = ['images', 'documents', 'videos', 'optimized', 'thumbnails'];
        
        for (const dir of directories) {
            const dirPath = path.join(this.uploadDir, dir);
            
            try {
                const files = await fs.readdir(dirPath);
                
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    const stats = await fs.stat(filePath);
                    const age = now - stats.mtime.getTime();
                    
                    if (age > this.maxFileAge) {
                        await fs.unlink(filePath);
                        deletedCount++;
                    }
                }
            } catch (error) {
                // Directorio no existe o error leyendo
                continue;
            }
        }

        console.log(`✅ ${deletedCount} archivos antiguos eliminados`);
        return deletedCount;
    }

    // Buscar archivo en el sistema
    async findFileInSystem(fileId) {
        // Buscar en todos los directorios de uploads
        const directories = ['images', 'documents', 'videos'];
        
        for (const dir of directories) {
            const dirPath = path.join(this.uploadDir, dir);
            
            try {
                const files = await fs.readdir(dirPath);
                
                for (const file of files) {
                    if (file.includes(fileId)) {
                        const filePath = path.join(dirPath, file);
                        const stats = await fs.stat(filePath);
                        
                        return {
                            id: fileId,
                            path: filePath,
                            url: `/uploads/${dir}/${file}`,
                            size: stats.size,
                            type: dir.slice(0, -1) // Quitar 's' del final
                        };
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }

    // Generar ID único para archivo
    generateFileId() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Determinar tipo de archivo por mimetype
    getFileType(mimeType) {
        if (!mimeType) return 'document';
        
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType === 'application/pdf') return 'document';
        
        return 'document';
    }

    // Obtener mimetype por extensión
    getMimeTypeFromExtension(ext) {
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.avi': 'video/avi',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };

        return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
    }

    // Obtener estadísticas del servicio
    getStats() {
        return {
            registeredFiles: this.fileRegistry.size,
            uploadDir: this.uploadDir,
            maxFileAge: this.maxFileAge
        };
    }
}

module.exports = FileService;