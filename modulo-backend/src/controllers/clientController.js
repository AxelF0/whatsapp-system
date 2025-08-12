class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }

    async list(req, res) {
        try {
            const clients = await this.clientService.list(req.query);
            res.json({
                success: true,
                data: clients
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getById(req, res) {
        try {
            const client = await this.clientService.getById(req.params.id);
            
            if (client) {
                res.json({
                    success: true,
                    data: client
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Cliente no encontrado'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async createOrUpdate(req, res) {
        try {
            const client = await this.clientService.createOrUpdate(req.body);
            res.status(201).json({
                success: true,
                data: client
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async updatePreferences(req, res) {
        try {
            const client = await this.clientService.updatePreferences(
                req.params.id,
                req.body.preferencias
            );
            res.json({
                success: true,
                data: client
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async getHistory(req, res) {
        try {
            const history = await this.clientService.getHistory(req.params.id);
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async assignProperty(req, res) {
        try {
            const result = await this.clientService.assignProperty(
                req.params.id,
                req.body.propertyId
            );
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = ClientController;