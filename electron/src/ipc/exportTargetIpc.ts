// Where a Typst export should land, asked with the platform's own dialogs. Nothing is written here:
// tinymist writes the files itself, so the answer is a destination, not a copy.
import { BrowserWindow, dialog } from 'electron';
import { handleFsE } from './ipcResult';

type ExportTargetRequest = {
	/** one file through a save dialog, or a folder for one file per page */
	kind: 'file' | 'folder';
	defaultPath: string;
	/** the file's extension, for the save dialog's type filter */
	extension?: string;
	title?: string;
};

/** the formats the export dialog offers; anything else is not a filter this dialog should show */
const EXTENSIONS: Record<string, string> = { pdf: 'PDF', png: 'PNG', svg: 'SVG', html: 'HTML' };

export function registerExportTargetIpc(): void {
	handleFsE('shell:pickExportTarget', async (e, body: ExportTargetRequest) => {
		const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!;
		const title = typeof body?.title === 'string' ? body.title : undefined;
		const defaultPath = typeof body?.defaultPath === 'string' ? body.defaultPath : undefined;
		if (body?.kind === 'folder') {
			// createDirectory: macOS has no New Folder button without it, and a fresh folder is the
			// usual place for a document's pages
			const res = await dialog.showOpenDialog(win, { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
			return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
		}
		const extension = typeof body?.extension === 'string' ? body.extension : '';
		const name = EXTENSIONS[extension];
		if (!name) throw new Error(`Cannot export to .${extension}`);
		const res = await dialog.showSaveDialog(win, { title, defaultPath, filters: [{ name, extensions: [extension] }] });
		return res.canceled || !res.filePath ? null : res.filePath;
	});
}
