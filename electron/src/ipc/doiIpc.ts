// Cite by DOI's lookup (see ../doiLookup.ts). It runs here, not in the page, for the network
// stack: net.fetch is Chromium's, which follows the system's proxy settings, and a university
// network often needs them.
import { app, ipcMain, net } from 'electron';
import { lookupDoi } from '../doiLookup';

export function registerDoiIpc(): void {
	const userAgent = `Texpile/${app.getVersion()} (https://texpile.com)`;
	ipcMain.handle('doi:lookup', (_e, body: { doi: string }) =>
		lookupDoi(typeof body?.doi === 'string' ? body.doi.trim() : '', (url, init) => net.fetch(url, init), userAgent)
	);
}
