// servidor/modulo-base-datos/src/models/mongodb/

const mongoose = require('mongoose');

// Esquema para mensajes individuales
const messageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true // ID único del mensaje de WhatsApp
    },
    from: {
        type: String,
        required: true // Número de teléfono que envía
    },
    to: {
        type: String,
        required: true // Número de teléfono que recibe
    },
    body: {
        type: String,
        required: true // Contenido del mensaje
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'document'],
        default: 'text'
    },
    mediaUrl: {
        type: String // URL si es multimedia
    },
    direction: {
        type: String,
        enum: ['incoming', 'outgoing'],
        required: true
    },
    source: {
        type: String,
        enum: ['whatsapp-web', 'whatsapp-api'],
        required: true // De dónde vino el mensaje
    },
    processed: {
        type: Boolean,
        default: false // Si ya fue procesado por IA/Backend
    },
    response_sent: {
        type: Boolean,
        default: false // Si ya se envió respuesta
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Esquema para conversaciones completas
const conversationSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        required: true,
        unique: true
    },
    clientPhone: {
        type: String,
        required: true
    },
    agentPhone: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'pending'],
        default: 'active'
    },
    context: {
        clientInfo: {
            name: String,
            preferences: String,
            budget: String,
            location: String
        },
        lastInteraction: {
            type: Date,
            default: Date.now
        },
        summary: String // Resumen de la conversación para IA
    },
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para actualizar updatedAt
conversationSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Índices para optimizar consultas (evitar duplicados con unique en messageId)
messageSchema.index({ from: 1, to: 1, timestamp: -1 });
messageSchema.index({ processed: 1, timestamp: 1 });

conversationSchema.index({ clientPhone: 1, agentPhone: 1 });
conversationSchema.index({ status: 1, updatedAt: -1 });

// Exportar modelos
const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = {
    Message,
    Conversation
};