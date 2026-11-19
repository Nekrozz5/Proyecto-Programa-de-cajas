' =====================================================================
' Iniciar-POS.vbs (Acceso Directo Raíz)
' Doble clic para iniciar el Sistema POS en modo silencioso de escritorio.
' =====================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "wscript.exe """ & scriptDir & "\scripts\lanzar-silencioso.vbs""", 0, False

Set WshShell = Nothing
Set fso = Nothing
