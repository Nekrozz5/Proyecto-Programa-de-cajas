@echo off
setlocal
cd /d "%~dp0\.."

set DETENIDO=0
:: 1. Detener el proceso que escucha en el puerto 3000 y su arbol de hijos
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Deteniendo servidor POS en puerto 3000 (PID %%a)...
    taskkill /f /t /pid %%a >nul 2>&1
    set DETENIDO=1
)

:: Breve pausa para liberar sockets y cerrar conexiones SQLite
ping 127.0.0.1 -n 2 >nul

:: 2. Si el puerto 3000 sigue ocupado por algun subproceso rebelde, reintentar
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Servidor POS detenido exitosamente.
exit /b 0
