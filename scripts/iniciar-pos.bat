@echo off
setlocal enabledelayedexpansion

:: Navegar al directorio raiz del proyecto
cd /d "%~dp0\.."

:: 1. Autocompilacion automatica si falta el build de produccion
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

:: 2. Verificar si el servidor ya esta escuchando en el puerto 3000
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
    mshta "javascript:alert('El servidor POS no pudo arrancar.\nRevise el archivo server.log en la carpeta de instalación.');close();"
    exit /b 1
)

:: 3. Abrir Microsoft Edge en modo aplicacion de escritorio
echo Abriendo terminal POS en Microsoft Edge...
start msedge --app=http://localhost:3000/caja/pos --window-size=1280,800
if %errorlevel% neq 0 (
    start http://localhost:3000/caja/pos
)
