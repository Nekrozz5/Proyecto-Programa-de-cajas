; =====================================================================
; Script de Inno Setup: Sistema POS y Control de Cajas
; Compilar con Inno Setup Compiler 6.x (o ejecutar: iscc pos-cajas.iss)
; =====================================================================

#define MyAppName "Sistema POS y Control de Cajas"
#define MyAppVersion "1.3.1"
#define MyAppPublisher "POS Cajas"
#define MyAppExeName "lanzar-silencioso.vbs"
#define AppGuid "{{A87C39E2-5D4E-49A1-9F16-339281BD510F}"

[Setup]
; Metadatos e Identificación de la Aplicación
AppId={#AppGuid}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}

; Directorio de Instalación predeterminado en Program Files
DefaultDirName={autopf}\POS Cajas
DefaultGroupName=POS Cajas
DisableProgramGroupPage=yes

; Configuración de salida del compilador
OutputDir=output
OutputBaseFilename=Setup-POS-Cajas-v1.3.1
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern

; Permisos y Arquitectura
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=force
CloseApplicationsFilter=*.bat,*.vbs,*.exe,node.exe
RestartApplications=no

[Languages]
; Asistente de instalación en español
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
; Tarea para crear acceso directo opcional en el escritorio
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
; Permisos completos a la carpeta de la app para que SQLite WAL y backups puedan escribir sin elevación UAC
Name: "{app}"; Permissions: users-full
Name: "{app}\backups"; Permissions: users-full
Name: "{app}\.next"; Permissions: users-full

#define ExclusionesArchivos "caja.db,.env*,.env.local,.env.production,*.log,*.tmp,*.map,.cache,.github,.vscode"

[Files]
; 1. Archivos principales de la aplicación recolectados en 'dist' (se excluyen caja.db y variables .env para proteger datos y configuración)
; Se excluyen archivos de metadatos de desarrollo (*.map, *.d.ts, docs, tests) para reducir 17.000+ archivos y acelerar la instalación a segundos
Source: "..\dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "{#ExclusionesArchivos}"

; Dependencias node_modules: si no están dentro de dist, se empaquetan directamente desde la raíz
#if !DirExists("..\dist\node_modules") && DirExists("..\node_modules")
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "{#ExclusionesArchivos}"
#endif

; 2. Base de datos SQLite y Configuración inicial:
; REGLA CRÍTICA: 'onlyifdoesntexist' garantiza que una actualización o reinstalación NUNCA borre ni sobreescriba
; los datos de ventas, catálogo, usuarios o configuración previa del cliente.
; 'uninsneveruninstall' asegura que al desinstalar el programa tampoco se destruya la base de datos histórica.
Source: "..\dist\caja.db"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-full
#if FileExists("..\dist\.env.local")
Source: "..\dist\.env.local"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-full
#endif
#if FileExists("..\dist\.env.production")
Source: "..\dist\.env.production"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-full
#endif

[Icons]
; Acceso directo en el Menú Inicio apuntando a lanzar-silencioso.vbs
Name: "{group}\{#MyAppName}"; Filename: "{app}\scripts\lanzar-silencioso.vbs"; WorkingDir: "{app}"; Comment: "Iniciar Sistema POS y Control de Cajas"
Name: "{group}\Detener Servidor POS"; Filename: "{app}\scripts\detener-pos.bat"; WorkingDir: "{app}"; Comment: "Detener el servidor del POS"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Acceso directo en el Escritorio apuntando a lanzar-silencioso.vbs
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\scripts\lanzar-silencioso.vbs"; WorkingDir: "{app}"; Comment: "Iniciar Sistema POS y Control de Cajas"; Tasks: desktopicon

[Run]
; Opción para iniciar automáticamente el sistema al finalizar la instalación
Filename: "{app}\scripts\lanzar-silencioso.vbs"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
; Detener cualquier proceso del servidor POS antes de desinstalar los archivos
Filename: "{app}\scripts\detener-pos.bat"; Flags: runhidden; RunOnceId: "DetenerServidorPOS"

[Code]
// =====================================================================
// Lógica de Protección para Actualizaciones y Reinstalaciones
// =====================================================================
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  StopBat, DbFile, BackupDir, BackupFile, FechaStr: String;
begin
  // 1. Detener el servidor POS si ya estaba corriendo para evitar bloqueos EBUSY o archivos .node bloqueados
  StopBat := ExpandConstant('{app}\scripts\detener-pos.bat');
  if FileExists(StopBat) then
  begin
    Exec(ExpandConstant('{cmd}'), '/c "' + StopBat + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  // Cierre forzoso de cualquier instancia residual de node.exe para liberar módulos nativos de C++ (better-sqlite3)
  Exec(ExpandConstant('{cmd}'), '/c taskkill /f /im node.exe >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/c taskkill /f /im wscript.exe >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Pausa de seguridad para que el kernel de Windows libere los handles de archivos y DLLs en memoria
  Sleep(1500);

  // 2. Respaldo preventivo automático de caja.db antes de aplicar cualquier archivo nuevo
  DbFile := ExpandConstant('{app}\caja.db');
  BackupDir := ExpandConstant('{app}\backups');
  if FileExists(DbFile) then
  begin
    ForceDirectories(BackupDir);
    FechaStr := GetDateTimeString('yyyymmdd_hhnnss', #0, #0);
    BackupFile := BackupDir + '\caja-pre-update-' + FechaStr + '.db';
    CopyFile(DbFile, BackupFile, False);
  end;

  Result := '';
end;

var
  BorrarDatosCompletos: Boolean;

// =====================================================================
// Lógica de Desinstalación: Preguntar si conserva o borra la Base de Datos
// =====================================================================
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Respuesta: Integer;
  Mensaje: String;
  AppDir: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    BorrarDatosCompletos := False;

    // Si no es desinstalación silenciosa, preguntar al usuario sobre la base de datos
    if not UninstallSilent then
    begin
      Mensaje := '¿Desea eliminar también la base de datos y todos los datos del sistema con la desinstalación?' + #13#10 + #13#10 +
                 '• SÍ (Borrar todo):' + #13#10 +
                 '  Se eliminarán permanentemente la base de datos (ventas, arqueos, inventario, catálogo),' + #13#10 +
                 '  todas las copias de seguridad y los archivos de configuración.' + #13#10 + #13#10 +
                 '• NO (Mantener datos):' + #13#10 +
                 '  Se desinstalará la aplicación pero se conservará la base de datos y respaldos intactos' + #13#10 +
                 '  (recomendado si piensa reinstalar el programa en el futuro o conservar su historial contable).';

      Respuesta := MsgBox(Mensaje, mbConfirmation, MB_YESNO or MB_DEFBUTTON2);
      if Respuesta = IDYES then
        BorrarDatosCompletos := True;
    end;
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    AppDir := ExpandConstant('{app}');

    if BorrarDatosCompletos then
    begin
      // 1. Eliminar base de datos SQLite y archivos de transacciones WAL
      DeleteFile(AppDir + '\caja.db');
      DeleteFile(AppDir + '\caja.db-wal');
      DeleteFile(AppDir + '\caja.db-shm');
      DeleteFile(AppDir + '\caja.db-journal');

      // 2. Eliminar variables de entorno y configuración local
      DeleteFile(AppDir + '\.env');
      DeleteFile(AppDir + '\.env.local');
      DeleteFile(AppDir + '\.env.production');

      // 3. Eliminar carpeta de copias de seguridad completa
      DelTree(AppDir + '\backups', True, True, True);

      // 4. Eliminar cualquier resto en la carpeta de la aplicación
      DelTree(AppDir + '\.next', True, True, True);
      DelTree(AppDir + '\node_modules', True, True, True);
      DelTree(AppDir + '\scripts', True, True, True);
      DelTree(AppDir, True, True, True);
      RemoveDir(AppDir);
    end;
  end
  else if CurUninstallStep = usDone then
  begin
    AppDir := ExpandConstant('{app}');
    // Si el usuario eligió mantener los datos y no es desinstalación silenciosa, recordarle dónde quedaron
    if (not BorrarDatosCompletos) and (not UninstallSilent) then
    begin
      if FileExists(AppDir + '\caja.db') then
      begin
        MsgBox('La aplicación ha sido desinstalada.' + #13#10 + #13#10 +
               'Su base de datos y copias de seguridad se han conservado exitosamente en:' + #13#10 +
               AppDir, mbInformation, MB_OK);
      end;
    end;
  end;
end;
