// window.texpileKeybindings: where the user's keybindings.json is, and when it changed
import { contextBridge, ipcRenderer } from 'electron';
import { invokeReady } from './preloadIpc';

contextBridge.exposeInMainWorld('texpileKeybindings', {
	path: (): Promise<string> => invokeReady('keybindings:path'),
	/** makes the file with a starter when there is none; its path */
	ensure: (): Promise<string> => invokeReady('keybindings:ensure'),
	onChanged: (cb: () => void) => {
		function h() {
			cb();
		}
		ipcRenderer.on('keybindings:changed', h);
		return () => ipcRenderer.removeListener('keybindings:changed', h);
	}
});
