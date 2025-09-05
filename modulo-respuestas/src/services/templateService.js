// servidor/modulo-respuestas/src/services/templateService.js

class TemplateService {
    constructor() {
        this.templates = new Map();
        this.loadDefaultTemplates();
    }

    // Cargar plantillas predeterminadas
    async loadDefaultTemplates() {
        console.log('📋 Cargando plantillas predeterminadas...');

        // Plantillas para clientes
        this.templates.set('welcome_client', {
            id: 'welcome_client',
            name: 'Bienvenida Cliente',
            category: 'client',
            content: `¡Hola {{nombre}}! 👋

Soy tu asistente inmobiliario virtual. Estoy aquí para ayudarte a encontrar la propiedad perfecta.

¿En qué puedo ayudarte hoy?
• 🏠 Ver propiedades disponibles
• 💰 Consultar precios y financiamiento
• 📍 Buscar por ubicación
• 📋 Agendar una visita

¡Escribe tu consulta y te responderé de inmediato!`,
            variables: ['nombre']
        });

        this.templates.set('property_info', {
            id: 'property_info',
            name: 'Información de Propiedad',
            category: 'client',
            content: `🏠 *{{nombre_propiedad}}*

📍 *Ubicación:* {{ubicacion}}
💰 *Precio:* {{precio}} Bs
📏 *Tamaño:* {{tamano}}
🛏️ *Dormitorios:* {{dormitorios}}
🚿 *Baños:* {{banos}}

📝 *Descripción:*
{{descripcion}}

{{#caracteristicas}}
✨ *Características destacadas:*
{{caracteristicas}}
{{/caracteristicas}}

¿Te interesa esta propiedad? Puedo:
• 📸 Enviarte más fotos
• 📅 Agendar una visita
• 💬 Responder tus preguntas

¡Escríbeme qué necesitas!`,
            variables: ['nombre_propiedad', 'ubicacion', 'precio', 'tamano', 'dormitorios', 'banos', 'descripcion', 'caracteristicas']
        });

        this.templates.set('search_results', {
            id: 'search_results',
            name: 'Resultados de Búsqueda',
            category: 'client',
            content: `🔍 *Encontré {{total}} propiedades para ti:*

{{#propiedades}}
━━━━━━━━━━━━━━━
🏠 *{{nombre}}*
📍 {{ubicacion}}
💰 {{precio}} Bs
🛏️ {{dormitorios}} dorm | 🚿 {{banos}} baños
━━━━━━━━━━━━━━━

{{/propiedades}}

¿Te interesa alguna? Escribe el número o nombre de la propiedad para más detalles.

💡 *Tip:* También puedes refinar tu búsqueda indicando:
• Rango de precio específico
• Zona preferida
• Número de habitaciones`,
            variables: ['total', 'propiedades']
        });

        this.templates.set('visit_scheduled', {
            id: 'visit_scheduled',
            name: 'Visita Agendada',
            category: 'client',
            content: `✅ *¡Visita agendada con éxito!*

📅 *Fecha:* {{fecha}}
🕐 *Hora:* {{hora}}
📍 *Dirección:* {{direccion}}
🏠 *Propiedad:* {{propiedad}}
👤 *Agente:* {{agente}}

*Recomendaciones para tu visita:*
• Llega 5-10 minutos antes
• Trae una lista de preguntas
• Toma fotos si lo deseas
• Consulta sobre los servicios de la zona

¿Necesitas reprogramar? Escríbeme con anticipación.

¡Te esperamos! 😊`,
            variables: ['fecha', 'hora', 'direccion', 'propiedad', 'agente']
        });

        // Plantillas para agentes/gerentes
        this.templates.set('command_success', {
            id: 'command_success',
            name: 'Comando Exitoso',
            category: 'system',
            content: `✅ *Comando ejecutado exitosamente*

{{#detalles}}
📋 *Detalles:*
{{detalles}}
{{/detalles}}

{{#id}}
🔖 *ID:* {{id}}
{{/id}}

{{#timestamp}}
🕐 *Hora:* {{timestamp}}
{{/timestamp}}`,
            variables: ['detalles', 'id', 'timestamp']
        });

        this.templates.set('command_error', {
            id: 'command_error',
            name: 'Error en Comando',
            category: 'system',
            content: `❌ *Error ejecutando comando*

{{#error}}
⚠️ *Error:* {{error}}
{{/error}}

{{#sugerencia}}
💡 *Sugerencia:* {{sugerencia}}
{{/sugerencia}}

Escribe "AYUDA" para ver los comandos disponibles.`,
            variables: ['error', 'sugerencia']
        });

        this.templates.set('property_created', {
            id: 'property_created',
            name: 'Propiedad Creada',
            category: 'system',
            content: `✅ *Propiedad registrada exitosamente*

📋 *Detalles:*
• *ID:* {{id}}
• *Nombre:* {{nombre}}
• *Ubicación:* {{ubicacion}}
• *Precio:* {{precio}} Bs
• *Estado:* Activa

La propiedad ya está disponible para los clientes.

*Próximos pasos:*
• Agregar fotos: FOTOS {{id}}
• Modificar: MODIFICAR PROPIEDAD {{id}}
• Ver detalles: VER PROPIEDAD {{id}}`,
            variables: ['id', 'nombre', 'ubicacion', 'precio']
        });

        this.templates.set('daily_report', {
            id: 'daily_report',
            name: 'Reporte Diario',
            category: 'system',
            content: `📊 *Reporte Diario - {{fecha}}*

*📈 Estadísticas:*
• Consultas recibidas: {{consultas}}
• Propiedades mostradas: {{propiedades_mostradas}}
• Visitas agendadas: {{visitas}}
• Nuevos clientes: {{nuevos_clientes}}

*🏆 Top Propiedades:*
{{#top_propiedades}}
{{posicion}}. {{nombre}} - {{consultas}} consultas
{{/top_propiedades}}

*👥 Actividad de Agentes:*
{{#agentes}}
• {{nombre}}: {{mensajes}} mensajes, {{visitas}} visitas
{{/agentes}}

¡Excelente trabajo equipo! 💪`,
            variables: ['fecha', 'consultas', 'propiedades_mostradas', 'visitas', 'nuevos_clientes', 'top_propiedades', 'agentes']
        });

        // Plantillas de notificación
        this.templates.set('new_lead', {
            id: 'new_lead',
            name: 'Nuevo Lead',
            category: 'notification',
            content: `🔔 *Nuevo cliente potencial*

👤 *Cliente:* {{nombre}}
📱 *Teléfono:* {{telefono}}
🏠 *Interesado en:* {{interes}}
💰 *Presupuesto:* {{presupuesto}}
📍 *Zona preferida:* {{zona}}

⚡ *Prioridad:* {{prioridad}}

El cliente está esperando respuesta. ¡Contáctalo pronto!`,
            variables: ['nombre', 'telefono', 'interes', 'presupuesto', 'zona', 'prioridad']
        });

        console.log(`✅ ${this.templates.size} plantillas cargadas`);
    }

    // Obtener todas las plantillas
    async getAllTemplates() {
        return Array.from(this.templates.values());
    }

    // Obtener plantilla por ID
    async getTemplate(templateId) {
        return this.templates.get(templateId);
    }

    // Obtener plantillas por categoría
    async getTemplatesByCategory(category) {
        const templates = Array.from(this.templates.values());
        return templates.filter(t => t.category === category);
    }

    // Renderizar plantilla con datos
    async renderTemplate(templateId, data = {}) {
        const template = this.templates.get(templateId);

        if (!template) {
            throw new Error(`Plantilla no encontrada: ${templateId}`);
        }

        console.log(`📝 Renderizando plantilla: ${template.name}`);

        try {
            let content = template.content;

            // Reemplazar variables simples {{variable}}
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'string' || typeof value === 'number') {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    content = content.replace(regex, value);
                }
            }

            // Manejar condicionales {{#variable}}...{{/variable}}
            const conditionalRegex = /{{#(\w+)}}([\s\S]*?){{\/\1}}/g;
            content = content.replace(conditionalRegex, (match, variable, innerContent) => {
                if (data[variable]) {
                    if (Array.isArray(data[variable])) {
                        // Es un array, repetir el contenido para cada elemento
                        return data[variable].map(item => {
                            let itemContent = innerContent;

                            if (typeof item === 'object') {
                                for (const [key, value] of Object.entries(item)) {
                                    const regex = new RegExp(`{{${key}}}`, 'g');
                                    itemContent = itemContent.replace(regex, value);
                                }
                            } else {
                                itemContent = itemContent.replace(/{{\.}}/g, item);
                            }

                            return itemContent.trim();
                        }).join('\n');
                    } else {
                        // Es un valor truthy, incluir el contenido
                        return innerContent.trim();
                    }
                } else {
                    // Variable es falsy, omitir el contenido
                    return '';
                }
            });

            // Limpiar variables no utilizadas
            content = content.replace(/{{[^}]+}}/g, '');

            // Limpiar líneas vacías múltiples
            content = content.replace(/\n{3,}/g, '\n\n');

            return {
                templateId,
                templateName: template.name,
                content: content.trim(),
                rendered: true
            };

        } catch (error) {
            console.error('❌ Error renderizando plantilla:', error.message);
            throw error;
        }
    }

    // Crear nueva plantilla
    async createTemplate(templateData) {
        if (!templateData.id || !templateData.name || !templateData.content) {
            throw new Error('ID, nombre y contenido son requeridos');
        }

        if (this.templates.has(templateData.id)) {
            throw new Error(`Ya existe una plantilla con ID: ${templateData.id}`);
        }

        const template = {
            id: templateData.id,
            name: templateData.name,
            category: templateData.category || 'custom',
            content: templateData.content,
            variables: this.extractVariables(templateData.content),
            createdAt: new Date()
        };

        this.templates.set(template.id, template);

        console.log(`✅ Plantilla creada: ${template.name}`);

        return template;
    }

    // Actualizar plantilla existente
    async updateTemplate(templateId, updates) {
        const template = this.templates.get(templateId);

        if (!template) {
            throw new Error(`Plantilla no encontrada: ${templateId}`);
        }

        const updatedTemplate = {
            ...template,
            ...updates,
            id: templateId, // El ID no se puede cambiar
            updatedAt: new Date()
        };

        if (updates.content) {
            updatedTemplate.variables = this.extractVariables(updates.content);
        }

        this.templates.set(templateId, updatedTemplate);

        console.log(`✅ Plantilla actualizada: ${updatedTemplate.name}`);

        return updatedTemplate;
    }

    // Eliminar plantilla
    async deleteTemplate(templateId) {
        if (!this.templates.has(templateId)) {
            throw new Error(`Plantilla no encontrada: ${templateId}`);
        }

        const template = this.templates.get(templateId);
        this.templates.delete(templateId);

        console.log(`✅ Plantilla eliminada: ${template.name}`);

        return { deleted: true, templateId };
    }

    // Extraer variables de una plantilla
    extractVariables(content) {
        const variables = new Set();

        // Extraer variables simples {{variable}}
        const simpleRegex = /{{([^#/][^}]+)}}/g;
        let match;
        while ((match = simpleRegex.exec(content)) !== null) {
            variables.add(match[1].trim());
        }

        // Extraer variables de condicionales {{#variable}}
        const conditionalRegex = /{{#(\w+)}}/g;
        while ((match = conditionalRegex.exec(content)) !== null) {
            variables.add(match[1]);
        }

        return Array.from(variables);
    }

    // Validar datos contra plantilla
    validateTemplateData(templateId, data) {
        const template = this.templates.get(templateId);

        if (!template) {
            throw new Error(`Plantilla no encontrada: ${templateId}`);
        }

        const missingVariables = [];
        const requiredVariables = template.variables || [];

        for (const variable of requiredVariables) {
            if (!data.hasOwnProperty(variable)) {
                missingVariables.push(variable);
            }
        }

        return {
            isValid: missingVariables.length === 0,
            missingVariables,
            requiredVariables
        };
    }

    // Obtener estadísticas
    getStats() {
        const categories = {};

        for (const template of this.templates.values()) {
            categories[template.category] = (categories[template.category] || 0) + 1;
        }

        return {
            totalTemplates: this.templates.size,
            categories,
            templates: Array.from(this.templates.keys())
        };
    }
}

module.exports = TemplateService;