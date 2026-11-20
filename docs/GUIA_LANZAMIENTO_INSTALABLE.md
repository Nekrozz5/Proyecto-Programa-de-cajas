# Guía de Lanzamiento y Despliegue Híbrido: Instalador Windows y PWA

Esta guía detalla el procedimiento técnico para generar el instalador de escritorio de Windows (`Setup-POS-Cajas-v1.0.exe`), instalarlo en el equipo principal de cobro y desplegar la aplicación web progresiva (PWA) en dispositivos móviles para mozos y administradores.

---

## 1. Requisitos Previos para Compilar el Instalador

En el equipo de desarrollo/empaquetado se requiere:

- **Node.js**: Versión LTS (v18.x o v20.x de 64 bits) y npm funcional.
- **Inno Setup 6**: Descargar e instalar [Inno Setup 6.x](https://jrsoftware.org/isdl.php) (incluye el compilador gráfico y la utilidad de línea de comandos `iscc.exe`).
- **Variable de Entorno PATH**: Asegurar que la ruta a Inno Setup (ej. `C:\Program Files (x86)\Inno Setup 6`) esté agregada al `PATH` del sistema si se compila vía CLI.
- **Módulos nativos**: Dependencias de base de datos `better-sqlite3` y `sqlite3` compiladas para la arquitectura `win32-x64`.

---

## 2. Paso a Paso para Generar el Instalador (`Setup-POS-Cajas-v1.0.exe`)

Ejecutar la siguiente secuencia de comandos desde la raíz del proyecto:

### Paso 2.1: Compilar la aplicación Next.js para producción
```bash
npm run build
```
Genera los bundles optimizados en la carpeta `.next`.

### Paso 2.2: Recolectar y validar dependencias en `dist/`
```bash
npm run dist:prepare
```
*Para generar un instalador totalmente independiente (offline) que incluya físicamente los módulos nativos en la carpeta de distribución, ejecutar:*
```bash
node scripts/preparar-dist.js --copy-modules
```
Este script valida binarios nativos, copia `.next` (omitiendo caché temporal), scripts de arranque (`scripts/`), carpetas del núcleo (`database/`, `server/`, `public/`) y la plantilla de base de datos `caja.db`.

### Paso 2.3: Compilar el instalador con Inno Setup

**Opción A: Por línea de comandos (Recomendado)**
```bash
iscc /F"Setup-POS-Cajas-v1.0" installer/pos-cajas.iss
```

**Opción B: Con la interfaz gráfica de Inno Setup**
1. Abrir `installer/pos-cajas.iss` en **Inno Setup Compiler**.
2. (Opcional) Cambiar `#define MyAppVersion "1.0.0"` o el parámetro `OutputBaseFilename` si se requiere.
3. Presionar `Ctrl + F9` o el botón **Run / Compile**.

**Ubicación del binario generado:**
El instalador final se generará en:
```text
installer/output/Setup-POS-Cajas-v1.0.exe
```

---

## 3. Instalación en el Equipo del Cliente (PC de Cobro)

### Prerrequisitos en la PC de Cobro
1. **Windows 10 u 11 (64-bit)**.
2. **Node.js (LTS)** instalado en el sistema (requerido para ejecutar el servidor local).
3. **Microsoft Edge o Google Chrome** instalado.

### Proceso de Instalación
1. Copiar `Setup-POS-Cajas-v1.0.exe` a la PC de cobro.
2. Ejecutar el instalador haciendo clic derecho y seleccionando **"Ejecutar como administrador"**.
3. Seleccionar idioma (Español) y confirmar la ruta de instalación (`C:\Program Files\POS Cajas`).
4. Marcar la casilla **"Crear un acceso directo en el Escritorio"** y hacer clic en **Instalar**.
5. Al finalizar, mantener marcada la opción **"Ejecutar Sistema POS y Control de Cajas"** para el arranque inicial.

### Arquitectura de Ejecución en el Cliente
- **Arranque Silencioso:** El acceso directo apunta a `scripts/lanzar-silencioso.vbs`, el cual invoca `scripts/iniciar-pos.bat` en segundo plano sin mostrar ventanas negras de consola (CMD).
- **Modo Aplicación (Kiosco/Ventana limpia):** Abre automáticamente la terminal de caja en Microsoft Edge aislado (`--app=http://localhost:3000/caja/pos`), sin barras de navegación ni extensiones que distraigan al cajero.
- **Protección de Datos Históricos:** El instalador aplica la bandera `onlyifdoesntexist` sobre `caja.db`. Cualquier actualización futura o reinstalación del instalador **nunca sobreescribe ni borra** las ventas, arqueos ni catálogo existente.
- **Detener el Servidor:** Desde el Menú Inicio se dispone del acceso directo **"Detener Servidor POS"** (`scripts/detener-pos.bat`), que libera el puerto 3000 de forma ordenada.

---

## 4. Despliegue Híbrido PWA en Teléfonos y Tablets (Mozos y Administradores)

El sistema opera bajo una arquitectura híbrida donde la PC de cobro actúa como servidor local y los dispositivos móviles se conectan vía red local (LAN) o túnel seguro (Cloudflare Tunnel).

### Conectividad Previa
- **Red Local (WiFi):** Asegurar que el dispositivo móvil esté conectado a la misma red WiFi que la PC de cobro. Identificar la IP local de la PC (ej. `http://192.168.1.50:3000`).
- **Acceso Remoto Seguro (Recomendado):** Si se utiliza Cloudflare Tunnel (`cloudflared`), acceder mediante la URL segura asignada (ej. `https://pos.micomerio.com`).

---

### Instalación de PWA por Plataforma

#### A. Android (Google Chrome)
1. Abrir **Google Chrome** en el teléfono o tablet.
2. Ingresar a la URL del sistema (ej. `http://192.168.1.50:3000` o la URL HTTPS).
3. Tocar el menú de opciones (tres puntos verticales en la esquina superior derecha).
4. Seleccionar **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
5. Confirmar el nombre ("POS Cajas"). El ícono aparecerá en el cajón de apps y pantalla de inicio como una aplicación nativa.

#### B. iOS / iPadOS (Apple Safari)
1. Abrir **Safari** (obligatorio en iOS para registrar PWAs).
2. Navegar a la URL del sistema.
3. Tocar el botón de **Compartir** (ícono de rectángulo con flecha hacia arriba en la barra inferior).
4. Desplazarse hacia abajo y seleccionar **"Agregar al inicio"** (Add to Home Screen).
5. Tocar **"Agregar"** en la esquina superior derecha. Se creará el acceso directo con ícono dedicado e inicio en pantalla completa (`display: standalone`).

#### C. Windows Tablet / Portátil de Administración (Microsoft Edge)
1. Abrir **Microsoft Edge** y acceder al sistema.
2. Hacer clic en el ícono de instalación que aparece en el extremo derecho de la barra de direcciones (**"Aplicación disponible"**) o ir a `Menú (...) -> Aplicaciones -> Instalar este sitio como una aplicación`.
3. Confirmar la instalación. La aplicación se abrirá en su propia ventana sin interfaz de navegador.

---

## 5. Resumen Operativo para Soporte Técnico

| Acción | Comando / Archivo | Notas |
| :--- | :--- | :--- |
| **Compilar producción** | `npm run build` | Ejecutar antes de empaquetar |
| **Preparar distribución** | `node scripts/preparar-dist.js --copy-modules` | Deja todo listo en `dist/` |
| **Generar Setup .exe** | `iscc /F"Setup-POS-Cajas-v1.0" installer/pos-cajas.iss` | Salida en `installer/output/` |
| **Iniciar POS en PC** | Acceso directo en escritorio o `scripts/lanzar-silencioso.vbs` | Abre Edge en modo app |
| **Detener POS en PC** | Acceso directo Menú Inicio o `scripts/detener-pos.bat` | Cierra el proceso Node |
| **Respaldar Base de Datos** | `npm run backup` | Ejecuta SQLite `VACUUM INTO` |

---

## 6. Arquitectura del Instalador 100% Autónomo (Plug & Play para PC Virgen)

> **Estado:** Implementado y Verificado. El instalador no requiere software previo en Windows.

### 6.1. Diagnóstico de una PC Virgen
Una computadora recién salida de fábrica o formateada con Windows 10/11 carece de:
1. **Node.js en el PATH:** Los scripts batch y VBS fallaban al invocar `node` o `npm`.
2. **Microsoft Visual C++ Redistributable (x64):** Módulos nativos como `better-sqlite3` requieren `msvcp140.dll` y `vcruntime140.dll`. Sin ellas, la carga de binarios C++ fallaba con error de DLL faltante.

### 6.2. Implementación Aplicada

#### A. Inclusión de Node.js Portable Embebido
- **Estructura en distribución:** Ubicado en `{app}\bin\node.exe`.
- **Independencia del sistema:** `iniciar-pos.bat`, `iniciar-servidor.vbs` y `inicializar-entorno.js` priorizan el binario portable local:
  ```cmd
  if exist "%~dp0..\bin\node.exe" (
      set "NODE_CMD=%~dp0..\bin\node.exe"
  ) else (
      set "NODE_CMD=node"
  )
  ```
- **Arranque directo de Next.js:** `iniciar-servidor.vbs` invoca directamente `bin\node.exe node_modules\next\dist\bin\next start`, eliminando la dependencia de `npm`.
- **Resultado:** El software funciona inmediatamente sin requerir que el cliente descargue ni configure Node.js en Windows.

#### B. Empaquetado e Instalación Silenciosa de VC++ Redistributable
- **Archivo origen:** `redist/vc_redist.x64.exe` (Microsoft Visual C++ 2015-2022 Redistributable).
- **Inno Setup `[Run]`:**
  ```pascal
  Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /passive /norestart"; Check: VCRedistNecesario; StatusMsg: "Configurando librerías de sistema de Microsoft (C++)..."
  ```
- **Función Pascal `VCRedistNecesario`:** Verifica en el registro de Windows (`HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64`) si la librería ya está instalada para no reinstalar innecesariamente.

#### C. Criterios de Aceptación Verificados
- [x] Motor Node.js embebido copiado y verificado en `dist/bin/node.exe`.
- [x] Paquete Microsoft Visual C++ copiado y verificado en `dist/redist/vc_redist.x64.exe`.
- [x] Inno Setup configurado para instalación silenciosa automática de VC++ y bypass de advertencias de Node global.
- [x] Lanzadores desacoplados de `npm` y vinculados al runtime local.
