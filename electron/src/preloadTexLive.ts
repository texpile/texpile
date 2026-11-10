// window.texpileTexLive: Texpile's own TeX Live, installed from Preferences › Toolchain
import { contextBridge, ipcRenderer } from 'electron';
import { invokeReady } from './preloadIpc';

function subscribe(channel: string, cb: (payload: unknown) => void): () => void {
	function h(_e: unknown, payload: unknown) {
		cb(payload);
	}
	ipcRenderer.on(channel, h);
	return () => ipcRenderer.removeListener(channel, h);
}

contextBridge.exposeInMainWorld('texpileTexLive', {
	/** the pinned build, its download size on this machine, what is installed */
	status: () => invokeReady('toolchain:texlive:status'),
	/** download, check and install the pinned build; joins an install already under way */
	install: () => invokeReady('toolchain:texlive:install'),
	cancel: () => ipcRenderer.send('toolchain:texlive:cancel'),
	remove: () => invokeReady('toolchain:texlive:remove'),
	/** the lualatex in use is Texpile's own */
	inUse: () => invokeReady('toolchain:texlive:inUse'),
	/** the package holding a file a document loads, installed with tlmgr into Texpile's tree only */
	installFor: (file: string, root: string) => invokeReady('toolchain:texlive:installFor', file, root),
	/** an install's progress, whichever window started it */
	onProgress: (cb: (step: unknown) => void) => subscribe('toolchain:texlive:progress', cb),
	/** an install or removal ended, in any window */
	onFinished: (cb: (result: unknown) => void) => subscribe('toolchain:texlive:finished', cb)
});
