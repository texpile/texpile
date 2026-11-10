// window.texpileThemes: the user's themes folder, its .css files, and when any of it changed
import { contextBridge, ipcRenderer } from 'electron';
import { invokeReady } from './preloadIpc';

contextBridge.exposeInMainWorld('texpileThemes', {
	list: (): Promise<{ dir: string; files: string[] }> => invokeReady('themes:list'),
	open: (): Promise<string> => invokeReady('themes:open'),
	onChanged: (cb: () => void) => {
		function h() {
			cb();
		}
		ipcRenderer.on('themes:changed', h);
		return () => ipcRenderer.removeListener('themes:changed', h);
	}
});
