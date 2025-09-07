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

    async getUserById(id) {
        if (!id) {
            throw new Error('ID de usuario requerido');
        }
        return await this.userModel.findById(id);
    }

    async updateUser(id, userData) {
        if (!id) {
            throw new Error('ID de usuario requerido');
        }
        return await this.userModel.update(id, userData);
    }

    // Métodos para baja/alta (sin filtrar por estado)
    async findUserByPhoneAnyStatus(telefono) {
        if (!telefono) {
            throw new Error('Número de teléfono requerido');
        }
        console.log(`🔍 UserService: Buscando usuario por teléfono (any status): ${telefono}`);
        const user = await this.userModel.findByPhoneAnyStatus(telefono);
        console.log(`📊 UserService: Resultado teléfono ${telefono}:`, user ? `ID: ${user.id}, Estado: ${user.estado}` : 'No encontrado');
        return user;
    }

    async findUserByIdAnyStatus(id) {
        if (!id) {
            throw new Error('ID de usuario requerido');
        }
        console.log(`🔍 UserService: Buscando usuario por ID (any status): ${id}`);
        const user = await this.userModel.findByIdAnyStatus(id);
        console.log(`📊 UserService: Resultado ID ${id}:`, user ? `Nombre: ${user.nombre}, Estado: ${user.estado}` : 'No encontrado');
        return user;
    }

    async getAllUsersAnyStatus() {
        return await this.userModel.findAllAnyStatus();
    }

    async getUsersByStatus(estado) {
        return await this.userModel.findByStatus(estado);
    }
}

module.exports = UserService;