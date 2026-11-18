; =====================================================================
; Script de Inno Setup: Sistema POS y Control de Cajas
; Compilar con Inno Setup Compiler 6.x (o ejecutar: iscc pos-cajas.iss)
; =====================================================================

#define MyAppName "Sistema POS y Control de Cajas"
#define MyAppVersion "1.0.0"
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
OutputBaseFilename=Setup-POS-Cajas
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Permisos y Arquitectura
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=force
CloseApplicationsFilter=*.bat,*.vbs,node.exe

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

[Files]
; 1. Archivos principales de la aplicación recolectados en 'dist' (se excluyen caja.db y variables .env para proteger datos y configuración)
Source: "..\dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "caja.db,.env*,.env.local,.env.production,*.log,*.tmp"

; Dependencias node_modules: si no están dentro de dist, se empaquetan directamente desde la raíz
#if !DirExists("..\dist\node_modules") && DirExists("..\node_modules")
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".cache,*.log"
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
Filename: "{app}\scripts\detener-pos.bat"; Flags: runhidden

[Code]
// =====================================================================
// Lógica de Protección para Actualizaciones y Reinstalaciones
// =====================================================================
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  StopBat, DbFile, BackupDir, BackupFile, FechaStr: String;
begin
  // 1. Detener el servidor POS si ya estaba corriendo para evitar bloqueos EBUSY en .next o scripts
  StopBat := ExpandConstant('{app}\scripts\detener-pos.bat');
  if FileExists(StopBat) then
  begin
    Exec(ExpandConstant('{cmd}'), '/c "' + StopBat + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000); // 1 segundo de espera para que Windows libere el puerto 3000 y archivos
  end;

  // 2. Respaldo preventivo automático de caja.db antes de aplicar cualquier archivo nuevo
  DbFile := ExpandConstant('{app}\caja.db');
  BackupDir := ExpandConstant('{app}\backups');
  if FileExists(DbFile) then
  begin
    ForceDirectories(BackupDir);
    FechaStr := GetDateTimeString('yyyymmdd_hhnnss', #0, #0);
    BackupFile := BackupDir + '\caja-pre-update-' + FechaStr + '.db';
    FileCopy(DbFile, BackupFile, False);
  end;

  Result := '';
end;
