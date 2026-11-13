# Guía de Despliegue en AWS: Sistema POS y Control de Cajas

Esta guía detalla paso a paso cómo poner en producción este sistema en **AWS Lightsail** o **AWS EC2**, manteniendo bases de datos aisladas por negocio y optimizando costos.

---

## 1. Arquitectura Recomendada

- **Servidor:** AWS Lightsail (Instancia Linux Ubuntu 24.04 LTS).
  - Costo: **$3.50 a $5.00 USD / mes** (1 vCPU, 512 MB o 1 GB RAM, SSD 20-40 GB).
- **Base de Datos:** SQLite local persistente (`caja.db`) montada en disco SSD.
- **Acceso Web:** Nginx como Proxy Inverso + SSL gratuito (HTTPS) con Let's Encrypt / Certbot.
- **Respaldos:** Script automatizado (`npm run backup`) con `VACUUM INTO` y sincronización diaria a AWS S3.

---

## 2. Preparación Inicial del Servidor en AWS Lightsail

1. Inicia sesión en la consola de **AWS Lightsail** (o EC2).
2. Haz clic en **Create instance**.
3. Selecciona:
   - **Plataforma:** Linux/Unix.
   - **Blueprint:** OS Only -> **Ubuntu 24.04 LTS** (o 22.04 LTS).
   - **Plan:** $3.50/mes (512 MB) o $5.00/mes (1 GB RAM - Recomendado).
4. En la pestaña **Networking** de la instancia:
   - Asigna una **Static IP** (IP fija gratuita mientras esté vinculada a la instancia).
   - En el Firewall, asegúrate de tener abiertos los puertos:
     - `22` (SSH)
     - `80` (HTTP)
     - `443` (HTTPS)

---

## 3. Configuración del Sistema Operativo en el Servidor

Conéctate por SSH al servidor y ejecuta:

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias para compilar módulos nativos (sqlite3)
sudo apt install -y build-essential python3 sqlite3 curl git nginx certbot python3-certbot-nginx

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar gestor de procesos PM2
sudo npm install -g pm2
```

### Configuración de Memoria Swap (Vital para servidores de 512MB / 1GB)
Evita que el proceso se quede sin memoria RAM durante la compilación:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Despliegue del Negocio

### Paso 1: Clonar el Repositorio
Para cada negocio separado, clona su propio repositorio en una carpeta independiente:

```bash
cd /var/www
sudo git clone <URL_DEL_REPOSITORIO_DEL_NEGOCIO> negocio1
cd negocio1
sudo chown -R $USER:$USER /var/www/negocio1
```

### Paso 2: Configurar Variables de Entorno
Crea el archivo `.env` basado en la plantilla de producción:

```bash
cp .env.production.example .env
nano .env
```

Configura tus valores:
```env
NODE_ENV=production
PORT=3000
DATABASE_PATH=/var/www/negocio1/data/caja.db
SESSION_SECRET=$(openssl rand -hex 32)
DEVELOPER_PASSWORD=TuPasswordSuperSegura2026!
```

Crea el directorio de datos para la base de datos persistente:
```bash
mkdir -p data backups
```

### Paso 3: Instalar Dependencias y Compilar
```bash
npm ci
npm run build
```

### Paso 4: Iniciar con PM2 (Autoinicio y Resilencia)
```bash
pm2 start ecosystem.config.js --name "pos-negocio1"
pm2 save
pm2 startup
# (Ejecuta el comando que PM2 te imprima en pantalla para habilitar el arranque en boot)
```

---

## 5. Configurar Dominio y Certificado SSL (HTTPS) con Nginx

### Paso 1: Crear Bloque de Servidor en Nginx
```bash
sudo nano /etc/nginx/sites-available/negocio1.conf
```

Agrega la configuración:
```nginx
server {
    server_name pos.tunegocio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Habilita el sitio y reinicia Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/negocio1.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Paso 2: Instalar Certificado SSL Gratuito
Apunta el registro DNS `A` de tu subdominio (`pos.tunegocio.com`) a la Static IP de Lightsail y luego ejecuta:

```bash
sudo certbot --nginx -d pos.tunegocio.com
```
*Certbot configurará automáticamente la renovación de certificados cada 90 días.*

---

## 6. Alojar Múltiples Negocios en el Mismo Servidor (Ahorro de Costos)

Si deseas alojar varios clientes en un solo servidor Lightsail ($5 o $10 USD/mes):

1. Clona cada repositorio en una carpeta distinta:
   - `/var/www/negocio1` (Puerto `3001`, `caja.db` en su propia carpeta `data/`)
   - `/var/www/negocio2` (Puerto `3002`, `caja.db` en su propia carpeta `data/`)
2. En cada `.env` cambia el `PORT` asignado (`3001`, `3002`, etc.).
3. En Nginx creas un archivo de configuración para cada dominio apuntando al puerto respectivo:
   - `negocio1.tudominio.com` -> `proxy_pass http://127.0.0.1:3001;`
   - `negocio2.tudominio.com` -> `proxy_pass http://127.0.0.1:3002;`
4. Cada negocio queda **completamente aislado**, sin riesgo de que se mezclen ventas o usuarios, y el costo de servidor se divide entre todos los clientes.

---

## 7. Automatización de Copias de Seguridad (Cronjob + AWS S3)

Para garantizar que nunca se pierda un solo ticket de venta o cierre de caja:

1. Prueba el comando de respaldo manual:
   ```bash
   npm run backup
   ```
2. Programa la ejecución diaria automática a las 3:00 AM:
   ```bash
   crontab -e
   ```
   Agrega la siguiente línea al final:
   ```cron
   0 3 * * * cd /var/www/negocio1 && /usr/bin/npm run backup >> /var/log/pos-backup.log 2>&1
   ```
3. Si configuras la variable `S3_BUCKET=mi-bucket-backups` en tu `.env` e instalas `awscli` con credenciales IAM restringidas, el script subirá automáticamente cada respaldo a Amazon S3.
