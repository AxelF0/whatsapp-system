// servidor/modulo-respuestas/src/services/propertyAnalyzer.js
// Analiza respuestas de IA y extrae propiedades mencionadas + archivos asociados

const axios = require('axios');
const path = require('path');
const fs = require('fs');

class PropertyAnalyzer {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL || 'http://localhost:3006';
        this.mediaPath = path.join(__dirname, '../../uploads/properties');
        
        // Crear directorio si no existe
        if (!fs.existsSync(this.mediaPath)) {
            fs.mkdirSync(this.mediaPath, { recursive: true });
        }
    }

    /**
     * Analizar respuesta de IA y detectar propiedades mencionadas
     */
    async analyzeIAResponse(responseData) {
        console.log('🔍 Analizando respuesta IA para detectar propiedades...');
        
        try {
            const analysis = {
                hasProperties: false,
                mentionedProperties: [],
                suggestedFiles: [],
                requiresAgentAttention: false,
                analysisDetails: {}
            };

            // Obtener metadata de la respuesta IA
            const metadata = responseData.metadata || {};
            const message = responseData.message || '';
            
            // 1. Verificar si la respuesta menciona propiedades específicas
            const propertyMatches = await this.detectPropertyReferences(message);
            
            if (propertyMatches.length > 0) {
                analysis.hasProperties = true;
                
                // 2. Para cada propiedad detectada, obtener detalles y archivos
                for (const propertyRef of propertyMatches) {
                    const propertyDetails = await this.getPropertyDetails(propertyRef);
                    if (propertyDetails) {
                        analysis.mentionedProperties.push(propertyDetails);
                        
                        // 3. Buscar archivos asociados a la propiedad
                        const propertyFiles = await this.findPropertyFiles(propertyDetails.id);
                        analysis.suggestedFiles.push(...propertyFiles);
                    }
                }
            }
            
            // 4. Verificar si requiere atención del agente
            analysis.requiresAgentAttention = metadata.requires_agent_attention || 
                                            this.detectAgentRequired(message, metadata);
            
            // 5. Añadir detalles del análisis
            analysis.analysisDetails = {
                original_query: metadata.original_query,
                query_type: metadata.query_type,
                confidence: metadata.confidence,
                source: 'ia-module',
                processed_at: new Date().toISOString()
            };
            
            console.log(`✅ Análisis completado: ${analysis.mentionedProperties.length} propiedades, ${analysis.suggestedFiles.length} archivos`);
            
            return analysis;
            
        } catch (error) {
            console.error('❌ Error analizando respuesta IA:', error.message);
            return {
                hasProperties: false,
                mentionedProperties: [],
                suggestedFiles: [],
                requiresAgentAttention: true,
                analysisDetails: { error: error.message }
            };
        }
    }

    /**
     * Detectar referencias a propiedades específicas en el texto
     */
    async detectPropertyReferences(message) {
        const propertyReferences = [];
        
        // Buscar patrones como "Propiedad #123", "PROP001", etc.
        const patterns = [
            /propiedad\s*#?(\d+)/gi,
            /prop\s*(\d+)/gi,
            /id[:\s]*(\d+)/gi,
            /código[:\s]*(\w+)/gi
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(message)) !== null) {
                const propertyId = match[1];
                if (propertyId && !propertyReferences.includes(propertyId)) {
                    propertyReferences.push(propertyId);
                }
            }
        }
        
        // También buscar por ubicación y tipo (menos preciso)
        if (propertyReferences.length === 0) {
            const locationMatches = await this.searchPropertiesByContent(message);
            propertyReferences.push(...locationMatches);
        }
        
        return propertyReferences;
    }

    /**
     * Buscar propiedades por contenido (ubicación, tipo, etc.)
     */
    async searchPropertiesByContent(message) {
        try {
            // Extraer palabras clave de ubicación y tipo
            const locations = this.extractLocations(message);
            const propertyTypes = this.extractPropertyTypes(message);
            
            if (locations.length === 0 && propertyTypes.length === 0) {
                return [];
            }
            
            // Buscar en BD propiedades que coincidan
            const searchResponse = await axios.post(
                `${this.databaseUrl}/api/properties/search`,
                {
                    locations,
                    types: propertyTypes,
                    limit: 3 // Máximo 3 propiedades
                },
                { timeout: 5000 }
            );
            
            if (searchResponse.data.success) {
                return searchResponse.data.data.map(prop => prop.id.toString());
            }
            
        } catch (error) {
            console.error('Error buscando propiedades por contenido:', error.message);
        }
        
        return [];
    }

    /**
     * Obtener detalles de una propiedad específica
     */
    async getPropertyDetails(propertyId) {
        try {
            const response = await axios.get(
                `${this.databaseUrl}/api/properties/${propertyId}`,
                { timeout: 5000 }
            );
            
            if (response.data.success) {
                return response.data.data;
            }
            
        } catch (error) {
            console.error(`Error obteniendo propiedad ${propertyId}:`, error.message);
        }
        
        return null;
    }

    /**
     * Buscar archivos asociados a una propiedad
     */
    async findPropertyFiles(propertyId) {
        const files = [];
        
        try {
            // Buscar archivos en directorio de uploads
            const propertyDir = path.join(this.mediaPath, propertyId.toString());
            
            if (fs.existsSync(propertyDir)) {
                const fileList = fs.readdirSync(propertyDir);
                
                for (const filename of fileList) {
                    const filePath = path.join(propertyDir, filename);
                    const stat = fs.statSync(filePath);
                    
                    if (stat.isFile()) {
                        files.push({
                            filename,
                            path: filePath,
                            size: stat.size,
                            type: this.getFileType(filename),
                            property_id: propertyId
                        });
                    }
                }
            }
            
            // También buscar en BD si hay registros de archivos
            try {
                const response = await axios.get(
                    `${this.databaseUrl}/api/properties/${propertyId}/files`,
                    { timeout: 5000 }
                );
                
                if (response.data.success && response.data.data) {
                    files.push(...response.data.data);
                }
            } catch (error) {
                // No es crítico si falla
                console.warn(`No se pudieron obtener archivos de BD para propiedad ${propertyId}`);
            }
            
        } catch (error) {
            console.error(`Error buscando archivos para propiedad ${propertyId}:`, error.message);
        }
        
        return files;
    }

    /**
     * Determinar si se requiere atención del agente
     */
    detectAgentRequired(message, metadata) {
        // Frases que indican interés alto
        const highInterestPhrases = [
            'coordinar cita', 'agendar', 'visita', 'ver la propiedad',
            'más información', 'más detalles', 'contactar', 'llamar',
            'cuando puedo', 'disponible', 'me interesa mucho'
        ];
        
        const messageLower = message.toLowerCase();
        const hasHighInterest = highInterestPhrases.some(phrase => messageLower.includes(phrase));
        
        // También verificar metadata
        const metadataIndicatesInterest = metadata.requires_agent_attention || 
                                         metadata.suggested_actions?.length > 0;
        
        return hasHighInterest || metadataIndicatesInterest;
    }

    /**
     * Extraer ubicaciones del mensaje
     */
    extractLocations(message) {
        const commonLocations = [
            'zona norte', 'zona sur', 'zona este', 'zona oeste', 'centro',
            'equipetrol', 'las palmas', 'plan 3000', 'mutualista',
            'barrio', 'sector', 'área'
        ];
        
        const locations = [];
        const messageLower = message.toLowerCase();
        
        for (const location of commonLocations) {
            if (messageLower.includes(location)) {
                locations.push(location);
            }
        }
        
        return locations;
    }

    /**
     * Extraer tipos de propiedad del mensaje
     */
    extractPropertyTypes(message) {
        const propertyTypes = [
            'casa', 'departamento', 'terreno', 'local', 'oficina', 'lote'
        ];
        
        const types = [];
        const messageLower = message.toLowerCase();
        
        for (const type of propertyTypes) {
            if (messageLower.includes(type)) {
                types.push(type);
            }
        }
        
        return types;
    }

    /**
     * Determinar tipo de archivo
     */
    getFileType(filename) {
        const ext = path.extname(filename).toLowerCase();
        
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const documentExts = ['.pdf', '.doc', '.docx'];
        const videoExts = ['.mp4', '.avi', '.mov'];
        
        if (imageExts.includes(ext)) return 'image';
        if (documentExts.includes(ext)) return 'document';
        if (videoExts.includes(ext)) return 'video';
        
        return 'other';
    }

    /**
     * Preparar respuesta enriquecida con información de propiedades
     */
    async enrichResponse(responseData, analysis) {
        if (!analysis.hasProperties) {
            return responseData;
        }
        
        const enrichedResponse = { ...responseData };
        
        // Agregar archivos sugeridos
        if (analysis.suggestedFiles.length > 0) {
            enrichedResponse.files = analysis.suggestedFiles;
            
            // Añadir nota sobre archivos disponibles
            enrichedResponse.message += '\n\n📎 He encontrado imágenes y documentos relacionados que te pueden interesar.';
        }
        
        // Si requiere atención del agente, agregar metadata
        if (analysis.requiresAgentAttention) {
            enrichedResponse.metadata = {
                ...enrichedResponse.metadata,
                requires_agent_attention: true,
                mentioned_properties: analysis.mentionedProperties.map(p => ({
                    id: p.id,
                    nombre: p.nombre_propiedad,
                    ubicacion: p.ubicacion,
                    precio: p.precio_venta || p.precio_alquiler
                })),
                suggested_agent_actions: [
                    'Contactar cliente para agendar visita',
                    'Proporcionar información adicional',
                    'Coordinar llamada telefónica'
                ]
            };
        }
        
        return enrichedResponse;
    }
}

module.exports = PropertyAnalyzer;