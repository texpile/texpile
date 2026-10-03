// saving a produced PDF where the user picks; `to` skips the dialog (tests)
import { BrowserWindow, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { handleFsE } from './ipcResult';

export function registerPdfSaveIpc(): void {
	// save the reconcile PDF (the document the live preview mirrors)
	handleFsE('draft:savePdf', async (e, body: { root: string; defaultName: string; to?: string }) => {
		const src = path.join(body.root, '_draft', 'draft.pdf');
		if (!fs.existsSync(src)) throw new Error('No compiled PDF yet.');
		let dest = body.to;
		if (!dest) {
			const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
				title: 'Save PDF',
				defaultPath: path.join(body.root, body.defaultName),
				filters: [{ name: 'PDF', extensions: ['pdf'] }]
			});
			if (res.canceled || !res.filePath) return { saved: false };
			dest = res.filePath;
		}
		fs.copyFileSync(src, dest);
		return { saved: true, path: dest };
	});

	// Save PDF bytes the renderer is holding. Byte-based rather than path-based because the PDF
	// viewer's source is not always a file on disk: a collaboration guest receives the document
	// over the wire and never has a local copy of it.
	handleFsE('shell:savePdfBytes', async (e, body: { bytes: Uint8Array; defaultName: string; to?: string }) => {
		const bytes = body?.bytes;
		if (!ArrayBuffer.isView(bytes) || bytes.byteLength === 0) throw new Error('No PDF data to save.');
		let dest = body.to;
		if (!dest) {
			const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
				title: 'Save PDF',
				defaultPath: body.defaultName,
				filters: [{ name: 'PDF', extensions: ['pdf'] }]
			});
			if (res.canceled || !res.filePath) return { saved: false };
			dest = res.filePath;
		}
		fs.writeFileSync(dest, bytes);
		return { saved: true, path: dest };
	});
}
