// citation lookups, run here for net.fetch: it follows the system proxy a university network often needs
import { app, ipcMain, net } from 'electron';
import { lookupDoi } from '../cite/doiLookup';
import { lookupIsbn, lookupPmid, searchWorks } from '../cite/citeSearch';

export function registerDoiIpc(): void {
	const userAgent = `Texpile/${app.getVersion()} (https://texpile.com)`;
	function fetch(url: string, init: RequestInit): Promise<Response> {
		return net.fetch(url, init);
	}
	function arg(body: unknown, name: string): string {
		const v = body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
		return typeof v === 'string' ? v.trim() : '';
	}
	ipcMain.handle('doi:lookup', (_e, body: unknown) => lookupDoi(arg(body, 'doi'), fetch, userAgent));
	ipcMain.handle('doi:search', (_e, body: unknown) => searchWorks(arg(body, 'query'), fetch, userAgent));
	ipcMain.handle('doi:isbn', (_e, body: unknown) => lookupIsbn(arg(body, 'isbn'), fetch, userAgent));
	ipcMain.handle('doi:pmid', (_e, body: unknown) => lookupPmid(arg(body, 'pmid'), fetch, userAgent));
}
