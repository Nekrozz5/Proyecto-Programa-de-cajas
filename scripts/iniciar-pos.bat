@echo off
setlocal enabledelayedexpansion

:: Navegar al directorio raiz del proyecto
cd /d "%~dp0\.."

:: 1. Localizar el ejecutable de Node.js (priorizar bin\node.exe embebido)
set "NODE_EXE=%~dp0..\bin\node.exe"
if exist "!NODE_EXE!" (
    set "NODE_CMD=!NODE_EXE!"
) else (
    where node >nul 2>&1
    if !errorlevel! equ 0 (
        set "NODE_CMD=node"
    ) else (
        mshta "javascript:alert('Error Crítico: No se encontró el motor de ejecución Node.js (ni en bin\\node.exe ni en el sistema).\n\nPor favor reinstale la aplicación.');close();"
        exit /b 1
    )
)

:: 2. Inicializar entorno seguro (generar SESSION_SECRET único si es necesario)
if exist "scripts\inicializar-entorno.js" (
    "!NODE_CMD!" scripts\inicializar-entorno.js >nul 2>&1
)

:: 3. Autocompilacion automatica si falta el build de produccion (solo en modo desarrollo)
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
