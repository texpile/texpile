// Which surfaces the OS draws and which the app draws, VS Code's defaults: context menus are
// native on macOS only (a custom title bar elsewhere means custom menus), message boxes are
// native on every desktop, and the web build draws everything itself because it has nothing else.
import { isMac } from './platform';
import { nativeBridge } from './workspace/fileSystem';

export function nativeContextMenus(): boolean {
	return isMac && !!nativeBridge()?.popupMenu;
}

export function nativeDialogs(): boolean {
	return !!nativeBridge()?.showMessageBox;
}
