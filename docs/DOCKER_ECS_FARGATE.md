# Empaquetado Docker para ECS Fargate

La imagen se construye en dos etapas y ejecuta `npm run start`, cuyo comando es
`next start`, en modo producción. El build ocurre dentro del contenedor Linux,
por lo que no depende de la creación de `.next` sobre el árbol sincronizado por
OneDrive.

## Build y ejecución local

```bash
docker build -t programa-cajas:local .
docker run --rm -p 3000:3000 --env-file .env.production programa-cajas:local
```

No copies `.env.local` ni secretos al contexto Docker. `.dockerignore` excluye
los archivos `.env*`; en ECS, inyecta las variables mediante Secrets Manager o
SSM Parameter Store en la definición de tarea. La imagen no contiene valores de
producción.

## Health check HTTP

El endpoint público y sin autenticación es:

```text
GET /api/health
200 {"status":"ok"}
```

La imagen también declara un `HEALTHCHECK` Docker que consulta
`http://127.0.0.1:${PORT}/api/health` cada 30 segundos. En la definición de
tarea ECS, configura el health check del servicio o del contenedor para usar
el mismo endpoint y el puerto `3000`.

## ECS/Fargate

La definición de tarea debe usar `awsvpc`, exponer el puerto `3000` y asignar un
execution role con permisos para descargar la imagen desde ECR y escribir logs.
Las credenciales de base de datos, sesión, SMTP y Secrets Manager deben entrar
por `secrets`, no por el Dockerfile ni por variables `environment` con valores
confidenciales.

Ejemplo de health check de contenedor:

```json
{
  "command": [
    "CMD-SHELL",
    "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))\""
  ],
  "interval": 30,
  "timeout": 5,
  "retries": 3,
  "startPeriod": 30
}
```

## EPERM de `.next` en OneDrive

El build local reproducido en este proyecto falla con:

```text
EPERM: operation not permitted, mkdir '.next/types/app/api'
```

OneDrive puede mantener o rehidratar directorios generados mientras webpack
los reemplaza. Para un build local, pausa la sincronización y elimina solo el
árbol generado `.next`, o ejecuta el proyecto desde una carpeta fuera de
OneDrive. Para CI/ECS, `docker build` evita el problema porque el builder
trabaja en su propio filesystem Linux y `.next` queda fuera del contexto gracias
al `.dockerignore`.
