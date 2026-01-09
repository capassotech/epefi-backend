# EPEFI Backend API

Backend API para la plataforma educativa EPEFI construida con Node.js, TypeScript y Firebase.

## 🚀 Inicio Rápido

```sh
npm i
npm run dev
```

## 🔧 Configuración de Entornos

El backend soporta múltiples entornos (QA y Producción) mediante variables de entorno.

### Variables de Entorno Requeridas

#### Firebase Admin SDK
- `FIREBASE_PROJECT_ID` - ID del proyecto de Firebase
- `FIREBASE_CLIENT_EMAIL` - Email del service account
- `FIREBASE_PRIVATE_KEY` - Clave privada del service account (con formato completo incluyendo `\n`)

#### Configuración del Servidor
- `PORT` - Puerto del servidor (default: 3000)
- `NODE_ENV` - Entorno de ejecución (`qa`, `production`, `development`)
- `FRONTEND_URL` - URL del frontend para CORS

#### Mercado Pago (Opcional)
- `MERCADO_PAGO_ACCESS_TOKEN` - Token de acceso de Mercado Pago
- `MERCADO_PAGO_WEBHOOK_SECRET` - Clave secreta para webhooks

### Configuración de Firebase

El backend puede configurarse de tres formas (en orden de prioridad):

1. **Archivo de Service Account** (Recomendado para desarrollo local)
   - Coloca `firebase-service-account.json` en `src/`
   - O configura `FIREBASE_SERVICE_ACCOUNT_PATH` en `.env`

2. **Variables de Entorno** (Recomendado para producción)
   - Configura `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

3. **Archivo por defecto**
   - Busca `firebase-service-account.json` en `src/`

### Endpoints Disponibles

- `GET /` - Información del servidor
- `GET /health` - Health check
- `POST /api/auth/*` - Autenticación
- `GET /api/cursos` - Gestión de cursos
- `GET /api/materias` - Gestión de materias
- `GET /api/modulos` - Gestión de módulos
- `GET /api/usuarios` - Gestión de usuarios

## 📦 Tecnologías

- **Node.js** - Runtime de JavaScript
- **TypeScript** - Tipado estático
- **Express.js** - Framework web
- **Firebase Admin SDK** - Autenticación y base de datos
- **Zod** - Validación de datos
- **CORS** - Configuración de CORS

## 🛠️ Scripts Disponibles

- `npm run dev` - Inicia servidor de desarrollo con hot reload
- `npm run build` - Compila TypeScript a JavaScript
- `npm start` - Inicia el servidor en modo producción

## 🔒 Autenticación

El backend utiliza Firebase Authentication. Todas las peticiones (excepto `/api/auth/login` y `/api/auth/register`) requieren un token de autenticación en el header:

```
Authorization: Bearer <firebase-id-token>
```

## 🌐 Despliegue

### Render.com

El backend está configurado para desplegarse en Render.com. Configura las siguientes variables de entorno en el dashboard de Render:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `NODE_ENV` (qa o production)
- `PORT` (opcional, default: 3000)
- `FRONTEND_URL`

### URLs de Despliegue

- **QA**: `https://epefi-backend-qa.onrender.com`
- **Producción**: `https://epefi-backend.onrender.com`

## 📝 Contribución

1. Fork el proyecto
2. Crea una rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request
