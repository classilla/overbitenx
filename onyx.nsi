RequestExecutionLevel user
SetCompressor zlib
Name "OverbiteNX Onyx Component"
OutFile "onyxinst.exe"
InstallDir "$LOCALAPPDATA\OverbiteNX"

VIProductVersion "0.9.2.0"
VIAddVersionKey "FileVersion" "0.9.2.0"
VIAddVersionKey "ProductName" "OverbiteNX Onyx Component Installer"
VIAddVersionKey "CompanyName" "The Overbite Project"
VIAddVersionKey "LegalCopyright" "© 2018 Cameron Kaiser"
VIAddVersionKey "FileDescription" "The native component for the OverbiteNX Gopher client."

function StrReplace
	Exch $0
	Exch
	Exch $1
	Exch
	Exch 2
	Exch $2
	Push $3
	Push $4
	Push $5
	Push $6
	Push $7
	Push $R0
	Push $R1
	Push $R2
	StrCpy $3 "-1"
	StrCpy $5 ""
	StrLen $6 $1
	StrLen $7 $0
	Loop:
		IntOp $3 $3 + 1
	Loop_noinc:
		StrCpy $4 $2 $6 $3
		StrCmp $4 "" ExitLoop
		StrCmp $4 $1 Replace
		Goto Loop

	Replace:
		StrCpy $R0 $2 $3
		IntOp $R2 $3 + $6
		StrCpy $R1 $2 "" $R2
		StrCpy $2 $R0$0$R1
		IntOp $3 $3 + $7
		Goto Loop_noinc
	ExitLoop:

	StrCpy $0 $2
	Pop $R2
	Pop $R1
	Pop $R0
	Pop $7
	Pop $6
	Pop $5
	Pop $4
	Pop $3
	Pop $2
	Pop $1
	Exch $0
FunctionEnd

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section

	SetOutPath $INSTDIR
	File "onyx.exe"

	FileOpen $0 "$INSTDIR\onyx.json" w
	FileWrite $0 "{"
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 '  "name" : "onyx",'
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 '  "description": "OverbiteNX Gopher system component",'
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 '  "path": "'
	; Double-backslash the path for JSON purposes.
	Push "$INSTDIR\onyx.exe"
	Push "\"
	Push "BACKSLASH_SEQUENCE"
	Call StrReplace
	Push "BACKSLASH_SEQUENCE"
	Push "\\"
	Call StrReplace
	Pop $1
	FileWrite $0 $1
	FileWrite $0 '",'
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 '  "type": "stdio",'
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 '  "allowed_extensions": [ "overbitenx@floodgap.com" ]'
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileWrite $0 "}"
	FileWriteByte $0 "13"
	FileWriteByte $0 "10"
	FileClose $0

	WriteUninstaller "$INSTDIR\Uninstall Onyx.exe"

	SetRegView 64
	WriteRegStr HKCU "SOFTWARE\Mozilla\NativeMessagingHosts\onyx" "" "$INSTDIR\onyx.json"

	WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "DisplayName" "OverbiteNX Onyx Component" 
	WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "Comments" "This is the native component that enables Firefox to connect to Gopher servers using OverbiteNX."
	WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "Publisher" "The Overbite Project"
	WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "HelpLink" "https://gopher.floodgap.com/overbite/"
	WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "UninstallString" "$\"$INSTDIR\Uninstall Onyx.exe$\""
	WriteRegDWORD HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "EstimatedSize" "130"
	WriteRegDWORD HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "NoModify" "1"
	WriteRegDWORD HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX" "NoRepair" "1"

SectionEnd

Section "Uninstall"

	MessageBox MB_OKCANCEL "Make sure Firefox is closed before continuing with uninstallation." IDOK next IDCANCEL quit

	quit:
		Abort "Restart the Uninstaller after quitting Firefox."

	next:
		SetRegView 64
		DeleteRegKey HKCU "SOFTWARE\Mozilla\NativeMessagingHosts\onyx"
		DeleteRegKey HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\OverbiteNX"

		Delete "$INSTDIR\Uninstall Onyx.exe"
		Delete "$INSTDIR\onyx.json"
		Delete "$INSTDIR\onyx.exe"

		RMDir "$INSTDIR"

SectionEnd

