; electron-builder auto-includes build/installer.nsh (nsis.include default).
;
; It writes the file associations on install but never tells the shell about them: its own
; SHChangeNotify call lives only in the UNINSTALL path (templates/nsis/uninstaller.nsh). Without
; this, Explorer keeps serving whatever handler it had cached until the next logoff, so a fresh
; install looks like it did nothing - the registry is right and the shell disagrees.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend
