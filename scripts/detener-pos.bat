@echo off
setlocal
cd /d "%~dp0\.."

set DETENIDO=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Deteniendo servidor POS en puerto 3000 (PID: %%a)...
    taskkill /f /t /pid %%a >nul 2>&1
    set DETENIDO=1
)

:: Detener cualquier proceso residual de Node o ejecutores de script
taskkill /f /im node.exe >nul 2>&1

echo Servidor POS y procesos asociados detenidos exitosamente.
exit /b 0
