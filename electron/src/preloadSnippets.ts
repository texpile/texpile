// window.texpileSnippets: the global snippet file and the package files, which live outside any workspace
import { contextBridge, ipcRenderer } from 'electron';
import { invokeFs } from './preloadIpc';

contextBridge.exposeInMainWorld('texpileSnippets', {
	/** its text, or null while there is none */
	readGlobal: () => invokeFs('snippets:readGlobal'),
	/** made empty first if missing; resolves to its path */
	ensureGlobal: () => invokeFs('snippets:ensureGlobal'),
	/** { snippets, packages }: the global file and the global package folder */
	locations: () => invokeFs('snippets:locations'),
	/** the global file or a global package file changed, from a Texpile tab or anywhere else */
	onGlobalChanged: (cb: () => void) => {
		function h() {
			cb();
		}
		ipcRenderer.on('snippets:globalChanged', h);
		return () => ipcRenderer.removeListener('snippets:globalChanged', h);
	},
	/** { global, project }: each package file's name and text */
	readPackages: (root: string | null) => invokeFs('snippets:readPackages', root),
	/** a .sty from the TeX installation by bare name, as text; null when it has none */
	texPackage: (name: string) => ipcRenderer.invoke('toolchain:texPackage', name)
});
