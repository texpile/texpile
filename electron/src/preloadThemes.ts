// window.texpileThemes: the user's themes folder, its .css files, and when any of it changed
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('texpileThemes', {
	list: (): Promise<{ dir: string; files: string[] }> => ipcRenderer.invoke('themes:list'),
	open: (): Promise<string> => ipcRenderer.invoke('themes:open'),
	onChanged: (cb: () => void) => {
		function h() {
			cb();
		}
		ipcRenderer.on('themes:changed', h);
		return () => ipcRenderer.removeListener('themes:changed', h);
	}
});
