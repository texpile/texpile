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
	/** the commands an installed package defines, as the reader's TeX reports them */
	probePackage: (name: string, options: string, classOptions: string) =>
		ipcRenderer.invoke('toolchain:probePackage', name, options, classOptions)
});
