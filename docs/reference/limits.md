---
nav: Limits
description: The size and count limits you can meet while writing in Texpile.
order: 2
---

# Limits

The visual editor cannot open files over 800 KB. They open in the source editor.

| Limit                      | Value | What happens                                                              |
| -------------------------- | ----- | ------------------------------------------------------------------------- |
| Open tabs                  | 50    | Opening another closes the oldest tab.                                    |
| Closed tabs you can reopen | 20    | `Ctrl Shift T` reopens the last one (Cmd on macOS).                       |
| Guests in a shared session | 8     | A ninth guest sees "This session is full."                                |
| File guests can edit       | 2 MiB | Larger files are view only for guests. Files over 100 MiB are not shared. |

## Version history

Every saved copy is kept for 7 days, then the last copy of each day for up to 30 days. Copies saved within 5 minutes of each other merge into one. Named copies, and the newest copy of each file, stay until you delete them.

Files over 1 MB get no copies. History uses up to 300 MB, and the oldest copies go first.
