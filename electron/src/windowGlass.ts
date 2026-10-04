// a see-through window: the system blurs what lies behind it (acrylic on Windows 11, vibrancy on macOS) and the page
// paints its grounds thin enough to let that show. Text and content stay solid, which a window opacity cannot do
import * as os from 'node:os';
import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron';
import { readSettings } from './appSettings';

let glassOn = false;

// acrylic came with Windows 11 22H2, and Electron has nothing like it on Linux
function glassWorks(): boolean {
	if (process.platform === 'darwin') return true;
	return process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;
}

/** a window fill set while this is true would cover the material, so whoever sets one asks first */
export function isGlassOn(): boolean {
	return glassOn;
}

function setGlass(win: BrowserWindow, on: boolean, solidFill: string): void {
	if (process.platform === 'darwin') win.setVibrancy(on ? 'under-window' : null);
	else win.setBackgroundMaterial(on ? 'acrylic' : 'none');
	win.setBackgroundColor(on ? '#00000000' : solidFill);
	nudge(win);
}

// macOS composites a page loaded (or reloaded) into a see-through window as opaque until the window next resizes, so the
// material shows as black under it; a one pixel resize is the only thing found that makes it redraw
function nudge(win: BrowserWindow): void {
	if (process.platform !== 'darwin' || !glassOn || win.isDestroyed() || win.isFullScreen() || win.isMaximized()) return;
	const [w, h] = win.getContentSize();
	win.setContentSize(w + 1, h);
	setTimeout(() => {
		if (!win.isDestroyed()) win.setContentSize(w, h);
	}, 100);
}

/** for new BrowserWindow(): a Mac window given vibrancy only after it exists draws black under any backdrop-filter (the
 *  frosted popups) once the mode changes, while one created with it can turn it off and on freely */
export const GLASS_AT_CREATION: BrowserWindowConstructorOptions = process.platform === 'darwin' ? { vibrancy: 'under-window' } : {};

export function applySavedGlass(win: BrowserWindow, solidFill: string): void {
	glassOn = glassWorks() && readSettings().transparentWindow === true;
	if (glassOn) setGlass(win, true, solidFill);
	else if (process.platform === 'darwin') win.setVibrancy(null);
	win.webContents.on('did-finish-load', () => nudge(win));
}

export function registerWindowGlassIpc(solidFill: () => string): void {
	ipcMain.handle('window:glassWorks', () => glassWorks());
	ipcMain.handle('window:setGlass', (_e, on: boolean) => {
		if (!glassWorks()) return false;
		glassOn = !!on;
		for (const win of BrowserWindow.getAllWindows()) setGlass(win, glassOn, solidFill());
		return glassOn;
	});
}
