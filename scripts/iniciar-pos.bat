@echo off
setlocal enabledelayedexpansion

:: Navegar al directorio raiz del proyecto
cd /d "%~dp0\.."

:: 1. Verificar si Node.js esta instalado en el sistema
where node >nul 2>&1
if %errorlevel% neq 0 (
    mshta "javascript:alert('Error Crítico: Node.js no se encuentra instalado o no está en la variable PATH de Windows.\n\nPor favor instale Node.js (versión 18 o superior) desde https://nodejs.org para poder ejecutar el Sistema POS.');close();"
    exit /b 1
)

:: 2. Inicializar entorno seguro (generar SESSION_SECRET único si es necesario)
if exist "scripts\inicializar-entorno.js" (
    node scripts\inicializar-entorno.js >nul 2>&1
)

:: 3. Autocompilacion automatica si falta el build de produccion
if not exist ".next\BUILD_ID" (
    echo ===============================================================
    echo   Configurando el Sistema POS por primera vez...
    echo   Compilando componentes y optimizando la aplicacion...
    echo ===============================================================
    call npm run build
    if errorlevel 1 (
        echo [ERROR] No se pudo compilar la aplicacion. Verifique las dependencias.
        pause
        exit /b 1
    )
)

:: 4. Verificar si el servidor ya esta escuchando en el puerto 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo Iniciando servidor POS en segundo plano...
    wscript //nologo "%~dp0iniciar-servidor.vbs"
    set intentos=0
    :esperar
    ping 127.0.0.1 -n 2 >nul
    netstat -ano | findstr :3000 | findstr LISTENING >nul
    if %errorlevel% neq 0 (
        set /a intentos+=1
        if !intentos! lss 40 goto esperar
    )
)

:: Verificar si el servidor logro responder
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    mshta "javascript:alert('El servidor POS no pudo arrancar en el puerto 3000.\n\nRevise el archivo server.log en la carpeta de instalación para más detalles.');close();"
    exit /b 1
)

:: 5. Abrir Microsoft Edge en modo aplicacion de escritorio
echo Abriendo terminal POS en Microsoft Edge...
start msedge --app=http://localhost:3000/caja/pos --window-size=1280,800
if %errorlevel% neq 0 (
    start http://localhost:3000/caja/pos
)
