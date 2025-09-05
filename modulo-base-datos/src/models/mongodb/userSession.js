// modulo-base-datos/src/models/mongodb/userSession.js

const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    user: {
        id: { type: Number, required: true },
        nombre: { type: String, required: true },
        apellido: String,
        cargo_id: Number,
        cargo_nombre: String
    },
    sessionType: {
        type: String,
        enum: ['agent-to-system'],
        default: 'agent-to-system'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    validatedAt: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
    },
    menuState: {
        current: { type: String, default: 'MAIN' },
        context: mongoose.Schema.Types.Mixed
    },
    activityCount: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

// Índices para consultas eficientes y TTL
userSessionSchema.index({ phoneNumber: 1, isActive: 1 });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // Limpieza cada 7 días

// Middleware para actualizar lastActivity
userSessionSchema.pre('save', function(next) {
    if (!this.isNew) {
        this.lastActivity = new Date();
    }
    next();
});

// Método para verificar si la sesión está expirada
userSessionSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

// Método para extender la sesión
userSessionSchema.methods.extend = function(hours = 24) {
    this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    this.lastActivity = new Date();
    this.activityCount += 1;
    return this.save();
};

const UserSession = mongoose.model('UserSession', userSessionSchema);

module.exports = UserSession;