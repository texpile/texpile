; electron-builder auto-includes build/installer.nsh (nsis.include default).
;
; It writes the file associations on install but never tells the shell about them: its own
; SHChangeNotify call lives only in the UNINSTALL path (templates/nsis/uninstaller.nsh). Without
; this, Explorer keeps serving whatever handler it had cached until the next logoff, so a fresh
; install looks like it did nothing - the registry is right and the shell disagrees.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

; electron-builder's own finish page, except that an update shows only its progress bar: it opens Texpile and closes
; instead of waiting on Finish
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function skipFinishOnUpdate
    ${if} ${isUpdated}
      ; Exec, not StartApp: ExecShellAsUser times out from a page callback, and this installer never runs elevated
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --updated'
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE skipFinishOnUpdate
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; no page of its own: the show function lands on the progress page that follows, which says Updating on an update
!macro customPageAfterChangeDir
  Function updatingHeader
    ${if} ${isUpdated}
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Texpile Update"
      !insertmacro MUI_HEADER_TEXT "Updating Texpile" "Texpile opens again when the update is done."
    ${endif}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW updatingHeader
!macroend

; per user only, so the folder page is the one extra step and updates need no admin
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
