class MessageService {
    constructor(MessageModel, ConversationModel) {
        this.Message = MessageModel;
        this.Conversation = ConversationModel;
    }

    async saveMessage(messageData) {
        // Validar datos requeridos
        if (!messageData.messageId || !messageData.from || !messageData.to) {
            throw new Error('Faltan datos requeridos: messageId, from, to');
        }

        // Asegurar body para tipos no text
        if (!messageData.body || typeof messageData.body !== 'string') {
            messageData.body = '';
        }

        try {
            // Evitar duplicados por reintentos de webhook
            const existing = await this.Message.findOne({ messageId: messageData.messageId });
            if (existing) {
                return existing;
            }

            // Crear el mensaje
            const message = new this.Message(messageData);
            await message.save();

            // Buscar o crear conversación
            const conversation = await this.getOrCreateConversation(messageData.from, messageData.to);
            
            // Agregar mensaje a la conversación
            conversation.messages.push(message._id);
            conversation.context.lastInteraction = new Date();
            await conversation.save();

            return message;
        } catch (error) {
            // Manejo de clave duplicada
            if (error && (error.code === 11000 || (error.message && error.message.includes('E11000')))) {
                const existingDup = await this.Message.findOne({ messageId: messageData.messageId });
                if (existingDup) return existingDup;
            }
            throw error;
        }
    }

    async getOrCreateConversation(clientPhone, agentPhone) {
        // Determinar quién es cliente y quién es agente
        let conversation = await this.Conversation.findOne({
            $or: [
                { clientPhone: clientPhone, agentPhone: agentPhone },
                { clientPhone: agentPhone, agentPhone: clientPhone }
            ]
        });

        if (!conversation) {
            // Crear nueva conversación
            const conversationId = `conv_${clientPhone}_${agentPhone}_${Date.now()}`;
            
            conversation = new this.Conversation({
                conversationId,
                clientPhone,
                agentPhone,
                status: 'active',
                context: {
                    lastInteraction: new Date()
                },
                messages: []
            });

            await conversation.save();
        }

        return conversation;
    }

    async getConversationHistory(clientPhone, agentPhone, limit = 50) {
        const conversation = await this.Conversation.findOne({
            $or: [
                { clientPhone: clientPhone, agentPhone: agentPhone },
                { clientPhone: agentPhone, agentPhone: clientPhone }
            ]
        }).populate({
            path: 'messages',
            options: { 
                sort: { timestamp: -1 },
                limit: limit
            }
        });

        return conversation;
    }

    async markMessageAsProcessed(messageId) {
        return await this.Message.findByIdAndUpdate(
            messageId,
            { processed: true },
            { new: true }
        );
    }

    async getUnprocessedMessages() {
        return await this.Message.find({ processed: false })
            .sort({ timestamp: 1 });
    }

    async updateConversationContext(conversationId, context) {
        return await this.Conversation.findOneAndUpdate(
            { conversationId },
            { 
                $set: { 
                    'context.clientInfo': context.clientInfo,
                    'context.summary': context.summary,
                    'context.lastInteraction': new Date()
                }
            },
            { new: true }
        );
    }
}

module.exports = MessageService;