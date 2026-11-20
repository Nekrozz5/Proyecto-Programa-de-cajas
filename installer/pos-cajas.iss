; =====================================================================
; Script de Inno Setup: Sistema POS y Control de Cajas
; Compilar con Inno Setup Compiler 6.x (o ejecutar: iscc pos-cajas.iss)
; =====================================================================

#define MyAppName "Sistema POS y Control de Cajas"
#define MyAppVersion "1.4.0"
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
UninstallDisplayName={#MyAppName} v{#MyAppVersion}

; Directorio de Instalación predeterminado en Program Files
DefaultDirName={autopf}\POS Cajas
DefaultGroupName=POS Cajas
DisableProgramGroupPage=yes

; Configuración de salida del compilador
OutputDir=output
OutputBaseFilename=Setup-POS-Cajas-v1.4.0
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern

; Metadatos embebidos en el binario ejecutable (Windows File Properties)
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName}
VersionInfoTextVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (C) 2026 {#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

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
; Opciones de accesos directos y comportamiento
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Iniciar el servidor POS automáticamente al encender el equipo"; GroupDescription: "Opciones avanzadas:"; Flags: unchecked

[Dirs]
; Permisos completos a la carpeta de la app para que SQLite WAL y backups puedan escribir sin elevación UAC
Name: "{app}"; Permissions: users-full
Name: "{app}\backups"; Permissions: users-full
Name: "{app}\.next"; Permissions: users-full

#define ExclusionesArchivos "caja.db,.env*,.env.local,.env.production,*.log,*.tmp,*.map,.cache,.github,.vscode"

[Files]
; 1. Archivos principales de la aplicación recolectados en 'dist' (se excluyen caja.db y variables .env para proteger datos y configuración)
; Se excluyen archivos de metadatos de desarrollo (*.map, *.d.ts, docs, tests) para acelerar la instalación a segundos
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

; 3. Microsoft Visual C++ Redistributable (se copia a carpeta temporal y se elimina tras instalar si falta)
#if FileExists("..\redist\vc_redist.x64.exe")
Source: "..\redist\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall ignoreversion; Check: VCRedistNecesario
#endif

[Registry]
; Inicio automático opcional con Windows (se elimina automáticamente al desinstalar si se activó)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "POSCajasServer"; ValueData: """{app}\scripts\lanzar-silencioso.vbs"""; Tasks: autostart; Flags: uninsdeletevalue

[Icons]
; Acceso directo en el Menú Inicio apuntando a lanzar-silencioso.vbs
Name: "{group}\{#MyAppName}"; Filename: "{app}\scripts\lanzar-silencioso.vbs"; WorkingDir: "{app}"; Comment: "Iniciar Sistema POS y Control de Cajas"
Name: "{group}\Detener Servidor POS"; Filename: "{app}\scripts\detener-pos.bat"; WorkingDir: "{app}"; Comment: "Detener el servidor del POS"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Acceso directo en el Escritorio apuntando a lanzar-silencioso.vbs
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\scripts\lanzar-silencioso.vbs"; WorkingDir: "{app}"; Comment: "Iniciar Sistema POS y Control de Cajas"; Tasks: desktopicon

[Run]
; 0. Instalar automáticamente librerías de Microsoft Visual C++ si faltan en Windows (requerido para better-sqlite3)
#if FileExists("..\redist\vc_redist.x64.exe")
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /passive /norestart"; Flags: waituntilterminated; Check: VCRedistNecesario; StatusMsg: "Configurando librerías esenciales de Microsoft (Visual C++)..."
#endif

; 1. Asegurar permisos de modificación NTFS (SID *S-1-5-32-545 = Usuarios de Windows en cualquier idioma)
Filename: "{sys}\icacls.exe"; Parameters: """{app}"" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q"; Flags: runhidden; StatusMsg: "Asegurando permisos para base de datos y respaldos..."

; 2. Configurar regla de Firewall de Windows para permitir acceso de comandas y móviles por LAN (Puerto 3000)
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""POS Cajas - Servidor Local (Puerto 3000)"" dir=in action=allow protocol=TCP localport=3000 profile=private,domain"; Flags: runhidden; StatusMsg: "Configurando acceso en red local (Firewall de Windows)..."

; 3. Inicializar entorno de producción seguro con secretos criptográficos únicos no compartidos
#if FileExists("..\dist\bin\node.exe") || FileExists("..\bin\node.exe")
Filename: "{app}\bin\node.exe"; Parameters: """{app}\scripts\inicializar-entorno.js"""; WorkingDir: "{app}"; Flags: runhidden; StatusMsg: "Generando credenciales y secretos criptográficos únicos..."
#else
Filename: "{cmd}"; Parameters: "/c node ""{app}\scripts\inicializar-entorno.js"""; WorkingDir: "{app}"; Flags: runhidden; StatusMsg: "Generando credenciales y secretos criptográficos únicos..."
#endif

; 4. Opción para iniciar automáticamente el sistema al finalizar la instalación
Filename: "{app}\scripts\lanzar-silencioso.vbs"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
; 1. Detener cualquier proceso del servidor POS antes de desinstalar los archivos
Filename: "{app}\scripts\detener-pos.bat"; Flags: runhidden; RunOnceId: "DetenerServidorPOS"

; 2. Eliminar la regla del Firewall de Windows para no dejar residuos en la seguridad del sistema
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""POS Cajas - Servidor Local (Puerto 3000)"""; Flags: runhidden; RunOnceId: "EliminarReglaFirewallPOS"

[Code]
// =====================================================================
// Detección de Visual C++ 2015-2022 (x64)
// =====================================================================
function VCRedistNecesario(): Boolean;
var
  Installed: Cardinal;
begin
  Result := True;
  // Verificar en el registro de 64 bits si el runtime ya se encuentra instalado
  if RegQueryDWordValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', Installed) then
  begin
    if Installed = 1 then
      Result := False; // Ya está instalado, omitir descarga/ejecución
  end;
end;

// =====================================================================
// Validación Previa: Comprobar presencia de Node.js en el sistema
// =====================================================================
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  
  // Si el instalador ya incluye su propio motor Node.js embebido, no se requiere Node global
  #if !FileExists("..\dist\bin\node.exe") && !FileExists("..\bin\node.exe")
  if not Exec(ExpandConstant('{cmd}'), '/c node -v >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    if MsgBox('ATENCIÓN: No se detectó Node.js instalado en este equipo.' + #13#10 + #13#10 +
              'El Sistema POS requiere Node.js (versión 18 LTS o superior) para ejecutar su servidor.' + #13#10 + #13#10 +
              'Puede continuar con la instalación ahora, pero deberá instalar Node.js antes de abrir el programa.' + #13#10 + #13#10 +
              '¿Desea continuar con la instalación de todos modos?',
              mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDNO then
    begin
      Result := False;
    end;
  end;
  #endif
end;

// =====================================================================
// Lógica de Protección para Actualizaciones y Reinstalaciones
// =====================================================================
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  StopBat, DbFile, BackupDir, BackupFile, FechaStr: String;
begin
  // 1. Detener el servidor POS y cerrar ventanas activas de Edge si ya estaba corriendo
  StopBat := ExpandConstant('{app}\scripts\detener-pos.bat');
  if FileExists(StopBat) then
  begin
    Exec(ExpandConstant('{cmd}'), '/c "' + StopBat + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  // Cierre complementario forzado por PowerShell para asegurar que no quede ninguna ventana ni proceso zombi
  Exec(ExpandConstant('{cmd}'), '/c powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq ''msedge.exe'' -and $_.CommandLine -like ''*localhost:3000*'') -or ($_.Name -eq ''node.exe'' -and ($_.CommandLine -like ''*POS Cajas*'' -or $_.CommandLine -like ''*next*'')) -or ($_.Name -eq ''wscript.exe'' -and ($_.CommandLine -like ''*POS Cajas*'' -or $_.CommandLine -like ''*lanzar*'')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Cerrar cualquier socket ocupado en el puerto 3000
  Exec(ExpandConstant('{cmd}'), '/c for /f "tokens=5" %a in (''netstat -ano ^| findstr :3000'') do taskkill /f /pid %a >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Pausa de 2 segundos para que el kernel de Windows libere todos los handles de archivos y DLLs
  Sleep(2000);

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

  // 3. Purgar completamente la carpeta .next vieja para eliminar chunks, manifests y caché residual
  if DirExists(ExpandConstant('{app}\.next')) then
  begin
    DelTree(ExpandConstant('{app}\.next'), True, True, True);
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
                 '• NO (Mantener datos - RECOMENDADO):' + #13#10 +
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

      // 3. Eliminar logs del servidor
      DeleteFile(AppDir + '\server.log');

      // 4. Eliminar carpeta de copias de seguridad completa
      DelTree(AppDir + '\backups', True, True, True);

      // 5. Eliminar cualquier resto en la carpeta de la aplicación
      DelTree(AppDir + '\.next', True, True, True);
      DelTree(AppDir + '\node_modules', True, True, True);
      DelTree(AppDir + '\scripts', True, True, True);
      DelTree(AppDir, True, True, True);
      RemoveDir(AppDir);
    end
    else
    begin
      // Modo conservación: Limpiar código y dependencias pesadas (.next, node_modules),
      // pero preservar caja.db, transacciones WAL y backups/
      DelTree(AppDir + '\.next', True, True, True);
      DelTree(AppDir + '\node_modules', True, True, True);
      DelTree(AppDir + '\scripts', True, True, True);
      DelTree(AppDir + '\server', True, True, True);
      DelTree(AppDir + '\public', True, True, True);
      DelTree(AppDir + '\database', True, True, True);
      DeleteFile(AppDir + '\server.log');
      DeleteFile(AppDir + '\package.json');
      DeleteFile(AppDir + '\next.config.js');
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
        MsgBox('La aplicación ha sido desinstalada correctamente.' + #13#10 + #13#10 +
               'Su base de datos (ventas, catálogo, arqueos) y copias de seguridad se han conservado intactas en:' + #13#10 +
               AppDir, mbInformation, MB_OK);
      end;
    end;
  end;
end;
