// window.texpileSnippets: snippet and package files outside any workspace
import { contextBridge, ipcRenderer } from 'electron';
import { invokeFs } from './preloadIpc';

contextBridge.exposeInMainWorld('texpileSnippets', {
	readGlobal: () => invokeFs('snippets:readGlobal'),
	ensureGlobal: () => invokeFs('snippets:ensureGlobal'),
	/** paths of the global snippet file and package folder */
	locations: () => invokeFs('snippets:locations'),
	onGlobalChanged: (cb: () => void) => {
		function h() {
			cb();
		}
		ipcRenderer.on('snippets:globalChanged', h);
		return () => ipcRenderer.removeListener('snippets:globalChanged', h);
	},
	/** { global, project }, each a name to text map */
	readPackages: (root: string | null) => invokeFs('snippets:readPackages', root),
	/** a .sty's text from the TeX installation, by bare name */
	texPackage: (name: string) => ipcRenderer.invoke('toolchain:texPackage', name)
});
