class UserController {
    constructor(userService) {
        this.userService = userService;
    }

    async list(req, res) {
        try {
            const users = await this.userService.list(req.query);
            res.json({
                success: true,
                data: users
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
            const user = await this.userService.getById(req.params.id);
            
            if (user) {
                res.json({
                    success: true,
                    data: user
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado'
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
            const user = await this.userService.create(req.body);
            res.status(201).json({
                success: true,
                data: user
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
            const user = await this.userService.update(req.params.id, req.body);
            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async deactivate(req, res) {
        try {
            const user = await this.userService.deactivate(req.params.id);
            res.json({
                success: true,
                data: user,
                message: 'Usuario desactivado correctamente'
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async getPerformance(req, res) {
        try {
            const performance = await this.userService.getPerformance(req.params.id);
            res.json({
                success: true,
                data: performance
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = UserController;