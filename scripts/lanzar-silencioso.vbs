' =====================================================================
' scripts/lanzar-silencioso.vbs
' Acceso directo principal de Windows (Escritorio / Menú Inicio).
' Arranca el Sistema POS de forma 100% silenciosa sin abrir terminales.
' =====================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)

' Si es la primera vez que se ejecuta y aún no está compilado, notificar brevemente al usuario
If Not fso.FileExists(rootDir & "\.next\BUILD_ID") Then
    WshShell.Popup "Iniciando el Sistema POS por primera vez..." & vbCrLf & "Por favor espere unos momentos mientras se optimiza la aplicación.", 4, "Sistema POS y Control de Cajas", 64
End If

' Ejecutar iniciar-pos.bat de forma completamente oculta (0 = vbHide, False = no bloquear)
WshShell.Run "cmd.exe /c """ & scriptDir & "\iniciar-pos.bat""", 0, False

Set WshShell = Nothing
Set fso = Nothing
