@echo off
setlocal enabledelayedexpansion

:: Navegar al directorio raiz del proyecto
cd /d "%~dp0\.."

:: Verificar si el servidor ya esta escuchando en el puerto 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo Iniciando servidor POS en modo produccion...
    start "" /b npm run start
    set intentos=0
    :esperar
    ping 127.0.0.1 -n 2 >nul
    netstat -ano | findstr :3000 | findstr LISTENING >nul
    if %errorlevel% neq 0 (
        set /a intentos+=1
        if !intentos! lss 30 goto esperar
    )
)

:: Abrir Microsoft Edge en modo aplicacion
echo Abriendo terminal POS en Microsoft Edge...
start msedge --app=http://localhost:3000/caja/pos --window-size=1280,800
