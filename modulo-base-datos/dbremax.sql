
-- Eliminar tablas si existen (para empezar limpio)
DROP TABLE IF EXISTS Propiedad_archivo CASCADE;
DROP TABLE IF EXISTS Conversacion CASCADE;
DROP TABLE IF EXISTS Propiedad CASCADE;
DROP TABLE IF EXISTS Cliente CASCADE;
DROP TABLE IF EXISTS Usuario CASCADE;
DROP TABLE IF EXISTS Cargo CASCADE;

-- Tabla: Cargo (Agente, Gerente)
CREATE TABLE Cargo (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

-- Insertar cargos básicos
INSERT INTO Cargo (nombre) VALUES ('Agente'), ('Gerente');

-- Tabla: Usuario (Agentes y Gerentes)
CREATE TABLE Usuario (
    id SERIAL PRIMARY KEY,
    cargo_id INT NOT NULL REFERENCES Cargo(id),
    nombre VARCHAR(30) NOT NULL,
    apellido VARCHAR(30) NOT NULL,
    telefono VARCHAR(20) NOT NULL UNIQUE,
    estado INT NOT NULL DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Cliente (Clientes potenciales)
CREATE TABLE Cliente (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(30),
    apellido VARCHAR(30),
    telefono VARCHAR(20) UNIQUE,
    email VARCHAR(50),
    estado INT NOT NULL DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Propiedad (Propiedades inmobiliarias)
CREATE TABLE Propiedad (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES Usuario(id),
    cliente_id INT REFERENCES Cliente(id),
    nombre_propiedad VARCHAR(200) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(12,2) NOT NULL,
    ubicacion VARCHAR(255) NOT NULL,
    superficie VARCHAR(30),
	dimensiones varchar(50),
    tipo_propiedad VARCHAR(50),
    estado INT NOT NULL DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Propiedad_archivo (Archivos de propiedades)
CREATE TABLE Propiedad_archivo (
    id SERIAL PRIMARY KEY,
    propiedad_id INT NOT NULL REFERENCES Propiedad(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(200) NOT NULL,
    url VARCHAR(400) NOT NULL,
    tipo_archivo VARCHAR(10) NOT NULL,
    estado INT NOT NULL DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Conversacion (Para MongoDB reference)
CREATE TABLE Conversacion (
    id SERIAL PRIMARY KEY,
    cliente_telefono VARCHAR(20) NOT NULL,
    agente_telefono VARCHAR(20) NOT NULL,
    mongo_conversation_id VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'activa',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas
CREATE INDEX idx_usuario_telefono ON Usuario(telefono);
CREATE INDEX idx_cliente_telefono ON Cliente(telefono);
CREATE INDEX idx_propiedad_precio ON Propiedad(precio);
CREATE INDEX idx_propiedad_ubicacion ON Propiedad(ubicacion);
CREATE INDEX idx_conversacion_cliente ON Conversacion(cliente_telefono);
CREATE INDEX idx_conversacion_agente ON Conversacion(agente_telefono);

-- Insertar datos de prueba
INSERT INTO Usuario (cargo_id, nombre, apellido, telefono) VALUES 
(1, 'Juan', 'Perez', '+59170000001'),
(1, 'Maria', 'Lopez', '+59170000002'),
(2, 'Carlos', 'Rodriguez', '+59170000003');

-- Verificar que se crearon correctamente
SELECT 'Usuarios creados:' as info;
SELECT u.nombre, u.apellido, u.telefono, c.nombre as cargo 
FROM Usuario u JOIN Cargo c ON u.cargo_id = c.id;