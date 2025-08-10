class UserService {
    constructor(userModel) {
        this.userModel = userModel;
    }

    async createUser(userData) {
        // Validar datos requeridos
        if (!userData.nombre || !userData.apellido || !userData.telefono || !userData.cargo_id) {
            throw new Error('Faltan datos requeridos: nombre, apellido, telefono, cargo_id');
        }

        // Validar que el teléfono no exista
        const existingUser = await this.userModel.findByPhone(userData.telefono);
        if (existingUser) {
            throw new Error('Ya existe un usuario con este número de teléfono');
        }

        return await this.userModel.create(userData);
    }

    async validateUser(telefono) {
        if (!telefono) {
            throw new Error('Número de teléfono requerido');
        }
        return await this.userModel.findByPhone(telefono);
    }

    async getAllUsers() {
        return await this.userModel.findAll();
    }

    async updateUser(id, userData) {
        if (!id) {
            throw new Error('ID de usuario requerido');
        }
        return await this.userModel.update(id, userData);
    }
}

module.exports = UserService;