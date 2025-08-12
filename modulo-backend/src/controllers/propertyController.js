class PropertyController {
    constructor(propertyService) {
        this.propertyService = propertyService;
    }

    async list(req, res) {
        try {
            const properties = await this.propertyService.list(req.query);
            res.json({
                success: true,
                data: properties
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
            const property = await this.propertyService.getById(req.params.id);
            
            if (property) {
                res.json({
                    success: true,
                    data: property
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Propiedad no encontrada'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async create(req, res) {
        try {
            const property = await this.propertyService.create(req.body);
            res.status(201).json({
                success: true,
                data: property
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async update(req, res) {
        try {
            const property = await this.propertyService.update(req.params.id, req.body);
            res.json({
                success: true,
                data: property
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async delete(req, res) {
        try {
            await this.propertyService.delete(req.params.id);
            res.json({
                success: true,
                message: 'Propiedad eliminada correctamente'
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async search(req, res) {
        try {
            const properties = await this.propertyService.search(req.body);
            res.json({
                success: true,
                data: properties
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getStats(req, res) {
        try {
            const stats = await this.propertyService.getStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = PropertyController;