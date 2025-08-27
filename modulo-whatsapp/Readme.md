# Módulo WhatsApp - Múltiples Sesiones

Sistema de atención al cliente con IA para RE/MAX usando únicamente WhatsApp-Web.js con soporte para múltiples sesiones simultáneas.

## 🎯 Casos de Uso

### Caso 1: Cliente → Agente
- **Flujo**: Cliente contacta al agente vía WhatsApp
- **Procesamiento**: IA analiza consultas inmobiliarias
- **Respuesta**: Automática con información de propiedades

### Caso 2: Agente/Gerente → Sistema
- **Flujo**: Personal autorizado contacta al sistema
- **Validación**: Verificación en base de datos de usuarios
- **Funciones**: Gestión de propiedades, clientes y reportes

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│     Cliente     │    │   WhatsApp-Web   │    │    Gateway      │
│                 │───▶│   (Agente)       │───▶│   + IA          │
└─────────────────┘    └──────────────────┘    └─────────────────┘

┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Agente/Gerente  │    │   WhatsApp-Web   │    │   Base de       │
│                 │───▶│   (Sistema)      │───▶│   Datos         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 Características Principales

- **Múltiples Sesiones**: Una para agente, una para sistema
- **Solo WhatsApp-Web.js**: Eliminada dependencia de API oficial
- **Procesamiento IA**: Para consultas de clientes
- **Validación de Usuarios**: Solo personal autorizado accede al sistema
- **Manejo de Errores**: Reintentos automáticos y recuperación
- **Monitoreo**: Estado en tiempo real de todas las sesiones

## 📦 Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Iniciar servidor
npm start

# Desarrollo con recarga automática
npm run dev
```

## 🔧 Configuración

### Variables de Entorno (.env)

```bash
# Servidor
WHATSAPP_PORT=3001

# Servicios externos
GATEWAY_URL=http://localhost:3000
DATABASE_URL=http://localhost:3006

# Configuración WhatsApp
WHATSAPP_HEADLESS=true
WHATSAPP_TIMEOUT=60000

# Pruebas
TEST_PHONE_AGENT=+59170000001
TEST_PHONE_SYSTEM=+59170000002
```

## 📱 Uso

### 1. Inicializar Sesiones

```bash
POST /api/initialize
{
  "agentPhone": "+59170000001",
  "agentName": "Agente RE/MAX",
  "systemPhone": "+59170000002", 
  "systemName": "Sistema RE/MAX"
}
```

### 2. Obtener Códigos QR

```bash
# QR del agente
GET /api/sessions/agent/qr

# QR del sistema
GET /api/sessions/system/qr
```

### 3. Verificar Estado

```bash
GET /api/sessions/status
```

### 4. Enviar Mensajes

```bash
# Desde agente (a cliente)
POST /api/agent/send
{
  "to": "59170000999",
  "message": "¡Hola! ¿En qué puedo ayudarte?"
}

# Desde sistema (a agente/gerente)
POST /api/system/send
{
  "to": "59170000001",
  "message": "Comando ejecutado exitosamente"
}
```

## 🧪 Pruebas

### Ejecutar Todas las Pruebas
```bash
npm test
# o
node src/test/testMultipleSessions.js
```

### Pruebas Individuales
```bash
# Verificar servidor
node src/test/testMultipleSessions.js single health

# Inicializar sesiones
node src/test/testMultipleSessions.js single initialize

# Ver códigos QR
node src/test/testMultipleSessions.js single qr
```

### Prueba de Estrés
```bash
# 10 mensajes (por defecto)
node src/test/testMultipleSessions.js stress

# 50 mensajes
node src/test/testMultipleSessions.js stress 50
```

## 📊 APIs Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/initialize` | POST | Inicializar todas las sesiones |
| `/api/sessions/status` | GET | Estado de todas las sesiones |
| `/api/sessions/:type/qr` | GET | Obtener QR de sesión específica |
| `/api/sessions/:type/restart` | POST | Reiniciar sesión específica |
| `/api/agent/send` | POST | Enviar mensaje desde agente |
| `/api/system/send` | POST | Enviar mensaje desde sistema |
| `/api/health` | GET | Estado del módulo |
| `/api/stats` | GET | Estadísticas detalladas |
| `/api/info` | GET | Información del módulo |

## 🔄 Flujos de Trabajo

### Cliente Consulta Propiedad
```
Cliente → WhatsApp → Agente → IA Gateway → Respuesta Automática
```

### Agente Registra Propiedad
```
Agente → WhatsApp → Sistema → Validación BD → Comando Backend → Confirmación
```

## 📝 Estructura del Proyecto

```
servidor/modulo-whatsapp/
├── src/
│   ├── index.js                    # Servidor principal
│   ├── services/
│   │   ├── multiSessionManager.js  # Gestor de sesiones
│   │   └── messageProcessor.js     # Procesador de mensajes
│   └── test/
│       └── testMultipleSessions.js # Tests automatizados
├── sessions/                       # Datos de autenticación WhatsApp
├── logs/                          # Archivos de log
├── package.json
├── .env                           # Variables de entorno
└── README.md
```

## 🛠️ Desarrollo

### Agregar Nueva Funcionalidad
1. Crear nueva ruta en `src/index.js`
2. Implementar lógica en `src/services/`
3. Agregar tests en `src/test/`
4. Actualizar documentación

### Debug
```bash
# Logs detallados
DEBUG=whatsapp:*,session:*,message:* npm start

# Solo errores
LOG_LEVEL=error npm start
```

## 🚨 Troubleshooting

### Problemas Comunes

#### Sesión No Se Conecta
```bash
# Limpiar datos de autenticación
rm -rf sessions/.wwebjs_auth/
# Reinicializar
POST /api/initialize
```

#### Error de Conexión con Servicios
```bash
# Verificar URLs en .env
GATEWAY_URL=http://localhost:3000
DATABASE_URL=http://localhost:3006

# Test de conectividad
curl http://localhost:3000/api/health
curl http://localhost:3006/api/health
```

#### Mensajes No Se Envían
```bash
# Verificar formato de número
# Correcto: 59170000999
# Incorrecto: +591-7000-0999

# Verificar estado de sesión
GET /api/sessions/status
```

### Logs Útiles
```bash
# Ver logs en tiempo real
tail -f logs/whatsapp.log

# Filtrar errores
grep "ERROR\|❌" logs/whatsapp.log
```

## 📈 Monitoreo

### Métricas Importantes
- Estado de conexión de sesiones
- Mensajes procesados por minuto
- Tiempo de respuesta de IA
- Errores de validación de usuarios

### Health Checks
```bash
# Estado general
curl http://localhost:3001/api/health

# Estadísticas detalladas  
curl http://localhost:3001/api/stats
```

## 🔒 Seguridad

- ✅ Validación de usuarios en base de datos
- ✅ Rate limiting en APIs
- ✅ Sanitización de mensajes
- ✅ Logs de auditoría
- ✅ Headers de seguridad

## 📚 Dependencias Principales

- **whatsapp-web.js**: Cliente WhatsApp Web
- **express**: Servidor HTTP
- **axios**: Cliente HTTP para APIs
- **qrcode-terminal**: Visualización de QR codes
- **puppeteer**: Automatización de navegador

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📞 Soporte

- **Issues**: [GitHub Issues](https://github.com/tu-repo/issues)
- **Email**: soporte@remax-system.com
- **Documentación**: `/api/info` endpoint

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver archivo [LICENSE.md](LICENSE.md) para detalles.

## 🎉 Changelog

### v2.0.0 (Actual)
- ✨ Refactorización completa para usar solo WhatsApp-Web.js
- ✨ Soporte para múltiples sesiones simultáneas
- ✨ Sistema de pruebas automatizadas
- ✨ Mejor manejo de errores y reconexión
- 🗑️ Eliminada dependencia de API oficial de WhatsApp

### v1.0.0 (Anterior)
- 🎯 Implementación inicial con API oficial
- 📱 Funcionalidad básica de mensajería
- 🤖 Integración con IA para respuestas automáticas