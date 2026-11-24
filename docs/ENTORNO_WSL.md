# Entorno de desarrollo WSL

El proyecto se ejecuta normalmente desde una terminal WSL usando Docker Desktop
con integración WSL.

## Checkouts

Actualmente pueden existir dos checkouts distintos:

- WSL: `~/proyectos/programa-cajas`
- Windows/Codex: `/mnt/c/Users/monta/OneDrive/Desktop/programa-cajas`

Antes de editar o ejecutar scripts, comprobar la ruta actual con `pwd`. Para
evitar divergencias, se recomienda trabajar desde WSL sobre el checkout que se
quiera conservar como fuente principal.

## Verificación de herramientas

Desde WSL:

```bash
docker info
aws.exe sts get-caller-identity
```

La región AWS del proyecto es `us-east-2`.

## Publicar una imagen ECR

Usar el script Bash desde la raíz del checkout:

```bash
COMMIT=$(git rev-parse --short HEAD)
bash deploy/push-ecr.sh v3.1.1 "$COMMIT"
```

El script acepta `aws` si está instalado en WSL y usa `aws.exe` como fallback.
También utiliza un directorio temporal de Docker para evitar fallos del helper
de credenciales de Windows desde WSL.
