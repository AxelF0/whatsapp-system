class MessageService {
    constructor(MessageModel, ConversationModel) {
        this.Message = MessageModel;
        this.Conversation = ConversationModel;
    }

    async saveMessage(messageData) {
        // Validar datos requeridos
        if (!messageData.messageId || !messageData.from || !messageData.to || !messageData.body) {
            throw new Error('Faltan datos requeridos: messageId, from, to, body');
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