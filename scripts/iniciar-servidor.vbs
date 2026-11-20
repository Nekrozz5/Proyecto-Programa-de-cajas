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

' Priorizar el motor Node.js embebido en bin\node.exe si existe
binNode = rootDir & "\bin\node.exe"
nextBin = rootDir & "\node_modules\next\dist\bin\next"

If fso.FileExists(binNode) And fso.FileExists(nextBin) Then
    ' Ejecución 100% autónoma sin requerir npm ni Node.js en Windows
    cmdLine = "cmd.exe /c """"" & binNode & """ """ & nextBin & """ start"" > """ & rootDir & "\server.log"" 2>&1"
Else
    ' Fallback para desarrollo o entornos con Node global
    cmdLine = "cmd.exe /c npm run start > """ & rootDir & "\server.log"" 2>&1"
End If

WshShell.Run cmdLine, 0, False

Set WshShell = Nothing
Set fso = Nothing
