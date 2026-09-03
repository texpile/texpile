// The native halves of two renderer surfaces: message boxes and context menus. Which platform
// gets which is the renderer's call (lib/platformSurfaces.ts); this only draws what it is sent.
import { BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import { orderForPlatform } from './messageBoxOrder';

export type MessageBoxRequest = {
	kind: 'question' | 'warning';
	title?: string;
	message: string;
	detail?: string;
	/** primary first, cancel last; the reply is an index into THIS array */
	buttons: string[];
	cancelId?: number;
};

export type PopupMenuRequest = {
	items: ({ separator: true } | { id: string; label: string; enabled?: boolean; accelerator?: string })[];
	x: number;
	y: number;
};

export function registerSurfacesIpc(): void {
	ipcMain.handle('dialog:messageBox', async (e, req: MessageBoxRequest) => {
		const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
		const order = orderForPlatform(req.buttons, req.cancelId);
		const { response } = await dialog.showMessageBox(win!, {
			type: req.kind,
			title: req.title,
			message: req.message,
			detail: req.detail,
			buttons: order.buttons,
			defaultId: order.defaultId,
			cancelId: order.cancelId,
			// Windows otherwise draws every button as a command link once there are more than two
			noLink: true
		});
		return order.original[response] ?? null;
	});

	ipcMain.handle('menu:popup', (e, req: PopupMenuRequest) => {
		const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
		return new Promise<string | null>((resolve) => {
			let done = false;
			const settle = (id: string | null) => {
				if (done) return;
				done = true;
				resolve(id);
			};
			const template: MenuItemConstructorOptions[] = req.items.map((i) =>
				'separator' in i
					? { type: 'separator' }
					: { label: i.label, enabled: i.enabled !== false, accelerator: i.accelerator, click: () => settle(i.id) }
			);
			// the close callback can land before a chosen item's click, so it yields to it first
			Menu.buildFromTemplate(template).popup({ window: win, x: req.x, y: req.y, callback: () => setTimeout(() => settle(null), 100) });
		});
	});
}
