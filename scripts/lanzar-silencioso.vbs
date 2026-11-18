Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Ejecutar iniciar-pos.bat de forma completamente oculta (0 = vbHide, False = no bloquear)
WshShell.Run "cmd.exe /c """ & scriptDir & "\iniciar-pos.bat""", 0, False

Set WshShell = Nothing
Set fso = Nothing
