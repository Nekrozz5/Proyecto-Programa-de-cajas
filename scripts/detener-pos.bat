@echo off
setlocal
cd /d "%~dp0\.."

echo ===============================================================
echo   Deteniendo Sistema POS y cerrando procesos asociados...
echo ===============================================================

:: 1. Cerrar ventanas de Microsoft Edge que ejecutan el POS (localhost:3000)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*localhost:3000*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

:: 2. Detener procesos en el puerto 3000 y su arbol de hijos
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /f /t /pid %%a >nul 2>&1
)

:: 3. Cerrar procesos de Node.js vinculados a este POS o a Next.js
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -like '*POS Cajas*' -or $_.CommandLine -like '*programa-cajas*' -or $_.CommandLine -like '*next*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

:: 4. Cerrar ejecutores de script de Windows (wscript) vinculados al POS
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'wscript.exe' -and ($_.CommandLine -like '*POS Cajas*' -or $_.CommandLine -like '*programa-cajas*' -or $_.CommandLine -like '*lanzar*' -or $_.CommandLine -like '*iniciar*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

:: Pausa breve para liberar sockets y handles de archivos
ping 127.0.0.1 -n 2 >nul

:: 5. Verificacion final de seguridad del puerto 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [OK] Servidor POS y ventanas asociadas cerrados exitosamente.
exit /b 0
