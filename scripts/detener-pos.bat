@echo off
setlocal
cd /d "%~dp0\.."

set DETENIDO=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Deteniendo servidor POS en puerto 3000 (PID: %%a)...
    taskkill /f /t /pid %%a >nul 2>&1
    set DETENIDO=1
)

if %DETENIDO% equ 1 (
    echo Servidor POS detenido exitosamente.
) else (
    echo No se encontro ningun proceso escuchando en el puerto 3000.
)
