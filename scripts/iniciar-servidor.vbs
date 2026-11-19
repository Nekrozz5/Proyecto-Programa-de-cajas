' =====================================================================
' scripts/iniciar-servidor.vbs
' Inicia el servidor de producción del Sistema POS de forma 100% oculta
' y persistente en segundo plano (desacoplado de cualquier consola).
' =====================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la ruta raíz del proyecto (un nivel arriba de scripts\)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)

WshShell.CurrentDirectory = rootDir

' Ejecutar 'npm run start' de forma oculta (0 = vbHide) y no bloqueante (False)
' Redirigir la salida a server.log para diagnóstico transparente sin consolas visibles
WshShell.Run "cmd.exe /c npm run start > """ & rootDir & "\server.log"" 2>&1", 0, False

Set WshShell = Nothing
Set fso = Nothing
