# Backend (Node.js + Express + PostgreSQL)

API del sistema de talleres (UMG). Provee endpoints para autenticación, talleres, inscripciones, depósitos, bancos, actividades y administración.

## 🚀 Requisitos
- Node.js 18+
- npm 9+
- PostgreSQL 13+

## ⚙️ Variables de entorno
Usa `./.env.example` como base. Crea tu `.env`:

```
cp .env.example .env
```

Claves principales:
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: conexión a PostgreSQL.
- `PORT`: puerto del servidor (por defecto 4000).
- `CLIENT_ORIGIN`: orígenes permitidos para CORS (coma-separados). En desarrollo con Vite suele ser `http://localhost:3000` o `http://localhost:5173`.
- `JWT_SECRET`: secreto para firmar JWT.
- `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` (opcional): vencimientos de tokens (por defecto `15m` y `7d`).
- `MAX_CONCURRENT_ENROLLMENTS`: máximo de talleres simultáneos por estudiante.
- Email (elige uno): `SMTP_*` o `GMAIL_USER`/`GMAIL_PASS`. Para desarrollo puedes usar `EMAIL_DEV_PREVIEW=1` y se guardarán vistas previas en `emails/outbox/`.

## 🗄️ Base de datos
El proyecto incluye DDL/migraciones mínimas:
- `create_users_table.sql`
- `create_workshops_table.sql`
- `create_deposits_table.sql`
- `create_banks_table.sql`
- `create_activity_logs_table.sql`
- `migrations/*` (índices y tablas adicionales; p. ej. `workshop_enrollments`)

Además, en el arranque se asegura (best‑effort):
- Índice único para `users.carnet_number` (normalizado).
- Tabla `activity_logs` y columnas auxiliares.
- Tabla `workshop_enrollments` si no existe.
- Columnas de soft-delete en `deposits`.

## 📦 Instalación y ejecución

```
npm install
npm run dev   # desarrollo
# o
npm start     # producción (asegúrate de tener .env configurado)
```

Servidor por defecto: `http://localhost:4000`

## 🔌 Endpoints (vista rápida)
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `GET /workshops`, `GET /workshops/:id`, `POST /workshops/:id/enroll`, `GET /workshops/:id/enrollments`
- `GET /deposits`, `POST /deposits`, `PUT /deposits/:id`, `DELETE /deposits/:id`
- `GET /banks`, `POST /banks`, ...
- `GET /admin/stats` (muestra `maxConcurrentEnrollments`, depósitos pendientes, etc.)

## 🔐 CORS y cookies
CORS se configura con `CLIENT_ORIGIN` (pueden ser varios, coma‑separados). Para desarrollo con Vite, el frontend suele correr en `http://localhost:3000` y el proxy redirige al backend en `http://localhost:4000`.

Las rutas usan cookies httpOnly para refresh tokens; por ello es importante usar el proxy de Vite (evita SameSite issues) o servir frontend y backend bajo el mismo dominio.

## 📁 Subidas (uploads)
Los archivos se guardan en `Backend/uploads/` (ignorado en .git). Se exponen de forma estática en `/uploads`. El middleware de subida (`src/middleware/upload.js`) acepta tipos comunes (imágenes/PDF) y limita el tamaño a 5MB.

## ✉️ Correo
`src/services/emailService.js` soporta:
- SMTP tradicional (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- Gmail (App Password) con `GMAIL_USER` y `GMAIL_PASS`.
- Modo previsualización para desarrollo (`EMAIL_DEV_PREVIEW=1`), guarda HTML en `emails/outbox/`.

## 🧪 Scripts útiles
- `npm run dev`: nodemon en desarrollo.
- `npm start`: producción.
- `npm run test:email`: genera una vista previa de correo en `emails/outbox/`.
- Scripts de diagnóstico/migración en `scripts/`.

## ✅ Salud y verificación
- `GET /health` retorna `{ status: 'ok' }` si el servidor está activo.

## 📄 Licencia
MIT (o la que prefieras; actualiza este apartado si aplica).
