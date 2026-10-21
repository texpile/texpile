// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LayoutMenu from '../../../../../src/views/workspace/titlebar/LayoutMenu.svelte';
import { layout } from '../../../../../src/lib/storage/layout';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

const panes = { sidebarOpen: true, pdfPaneOpen: true, pdfPopout: false, toggleSidebar() {}, togglePdfPane() {}, setPdfPopout() {} };
const termDock = { available: false, visible: false, toggle() {} };

function openMenu(splittable: boolean) {
	app = mount(LayoutMenu, {
		target: document.body.appendChild(document.createElement('div')),
		props: { panes, termDock, splittable } as never
	});
	flushSync();
	document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
	flushSync();
}

function item(label: string): HTMLButtonElement {
	return [...document.querySelectorAll<HTMLButtonElement>('[role=menu] button')].find((b) => b.textContent?.trim() === label)!;
}

// its click-away layer stayed up after a Preview item, and ate the next click anywhere in the window
it.each(['Split the preview', 'Open preview in its own window'])('closes after %s', (label) => {
	openMenu(true);
	item(label).click();
	flushSync();
	expect(document.querySelector('[role=menu]')).toBeNull();
});

it('leaves the split alone where the preview cannot split', () => {
	const before = layout.current.pdfSplit;
	openMenu(false);
	const split = item('Split the preview');
	expect(split.getAttribute('aria-disabled')).toBe('true');
	expect(split.getAttribute('data-tip')).toBe('Only a compiled PDF can be split');
	split.click();
	flushSync();
	expect(layout.current.pdfSplit).toBe(before);
	expect(document.querySelector('[role=menu]')).not.toBeNull();
});
