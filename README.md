# Sistema ALFALCA — ERP v1.0 (Fase 1: Ventas)

ERP para ALFALCA: 5 locales bajo una razón social, caja consolidada.

## Prerequisitos

- Node.js 20+
- npm 10+
- Cuenta Railway con Postgres ya provisionado
- Cuenta Cloudflare R2 (bucket `alfalca-files` ya creado)

## Setup local (primera vez)

```bash
# 1. Clonar
git clone https://github.com/plumasdistribuidora-max/sistema-alfalca.git
cd sistema-alfalca

# 2. Variables de entorno — copiar y completar
cp .env.example .env
# Editar .env con tus valores reales

# 3. Instalar dependencias (raíz + backend + frontend)
npm install
npm install --prefix backend
npm install --prefix frontend

# 4. Correr migraciones (crea todas las tablas)
npm run migrate

# 5. Seed inicial (admin + 5 locales)
npm run seed

# 6. Levantar backend + frontend en paralelo
npm run dev
```

El backend corre en `http://localhost:3001`  
El frontend corre en `http://localhost:5173`

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Postgres (Railway) |
| `JWT_SECRET` | Secreto para firmar JWT (mínimo 32 chars) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API Token → Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API Token → Secret Access Key |
| `R2_BUCKET` | `alfalca-files` |
| `NODE_ENV` | `development` o `production` |
| `PORT` | Puerto del backend (default: 3001) |
| `FRONTEND_URL` | URL del frontend para CORS (default: http://localhost:5173) |

## Scripts disponibles

```bash
npm run dev      # Backend + frontend en paralelo (desarrollo)
npm run migrate  # Crea/actualiza tablas en la DB
npm run seed     # Carga admin y 5 locales (idempotente, usa ON CONFLICT)
npm run build    # Build de producción del frontend
```

## Credenciales iniciales

- **Email:** martin@alfalca.com.ar  
- **Password:** Alfalca2026!  
- **Rol:** admin

> Cambiar el password en producción desde la DB directamente o implementando el endpoint /api/usuarios/cambiar-password en Fase 2.

## Locales (seed)

| ID | Código | Nombre | Tipo |
|---|---|---|---|
| 1 | amigorena | Amigorena Tienda de Alfajores | alfajores |
| 2 | nuevedejulio | 9 de Julio Tienda de Alfajores | alfajores |
| 3 | peatonal | Peatonal Tienda de Alfajores | alfajores |
| 4 | sheraton | Sheraton Tienda de Alfajores | alfajores |
| 5 | cafe_peatonal | Café Peatonal Cafetería | cafeteria |

> Peatonal y Café Peatonal comparten ubicación física pero son entidades separadas (local_id distinto, EERR separados, POS separados).

## Formato de Excel esperado (POS Bistrosoft)

- Fila 1–3: metadata del POS (Desde/Hasta/fechas) — ignoradas
- **Fila 4:** header real con columnas
- Columnas mínimas: `Id`, `Fecha`, `Estado`, `Medio de Pago`, `Total`, `Fiscal`, `Camarero / Repartidor`
- Solo filas con `Estado = "Cerrada"` se consideran venta real

## Arquitectura

```
/backend   Node.js + Express + pg
/frontend  Vite + React + Tailwind + Recharts
DB         Postgres (Railway)
Storage    Cloudflare R2 (archivos Excel originales)
Auth       JWT (7 días), bcrypt para passwords
```

## Roadmap

- **Fase 1** ✓ Ventas: import, listado, dashboards, comparativo
- **Fase 2** — Cash Flow: proyección 45 días, cheques, alertas
- **Fase 3** — Stock: existencias y sugerencias de pedido
- **Fase 4** — Benchmark Franquicia
- **Fase 5** — Personal, CMV/Pareto
