# ==========================================
# DOCKERFILE - SISTEMA POS Y CONTROL DE CAJAS
# ==========================================

FROM node:20-alpine AS base

# Dependencias del sistema necesarias para compilar módulos nativos (sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Instalar dependencias del proyecto
COPY package*.json ./
RUN npm ci

# Copiar el código fuente
COPY . .

# Compilar la aplicación Next.js para producción
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Crear directorios para persistencia de datos y respaldos
RUN mkdir -p /app/data /app/backups

# Variables por defecto
ENV PORT=3000
ENV DATABASE_PATH=/app/data/caja.db

EXPOSE 3000

# Arrancar la aplicación
CMD ["npm", "start"]
