// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LayoutMenu from '../../../../../src/views/workspace/titlebar/LayoutMenu.svelte';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

const panes = { sidebarOpen: true, pdfPaneOpen: true, pdfPopout: false, toggleSidebar() {}, togglePdfPane() {}, setPdfPopout() {} };
const termDock = { available: false, visible: false, toggle() {} };

// its click-away layer stayed up after a Preview item, and ate the next click anywhere in the window
it.each(['Split the preview', 'Open preview in its own window'])('closes after %s', (label) => {
	app = mount(LayoutMenu, {
		target: document.body.appendChild(document.createElement('div')),
		props: { panes, termDock, project: true, splittable: true } as never
	});
	flushSync();
	document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
	flushSync();
	document.querySelector<HTMLButtonElement>(`[role=menu] button[aria-label="${label}"]`)!.click();
	flushSync();
	expect(document.querySelector('[role=menu]')).toBeNull();
});
