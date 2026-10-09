// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CompileOptionsMenu from '../../../../src/views/workspace/CompileOptionsMenu.svelte';
import { AnchoredMenu } from '../../../../src/lib/pdf-view/anchoredMenu.svelte';

let app: Record<string, unknown> | null = null;
let stop: (() => void) | null = null;
afterEach(() => {
	if (app) unmount(app);
	stop?.();
	app = stop = null;
	document.body.innerHTML = '';
});

function open(): AnchoredMenu {
	let menu!: AnchoredMenu;
	stop = $effect.root(() => {
		menu = new AnchoredMenu('start');
	});
	menu.button = document.body.appendChild(document.createElement('button'));
	menu.toggle();
	app = mount(CompileOptionsMenu, {
		target: document.body.appendChild(document.createElement('div')),
		props: {
			menu,
			onConfigure: () => {},
			onFromScratch: () => {},
			onCleanAux: () => {},
			latexmkActions: true,
			onShowOutput: () => {},
			outputAvailable: true
		}
	});
	flushSync();
	return menu;
}

// the menu opens with the focus still on its chevron, so the key reaches the window, not the menu
it('closes on Escape', () => {
	const menu = open();
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	flushSync();
	expect(menu.open).toBe(false);
});

// hung inside the PDF bar, the bar clipped it out of sight
it('is fixed to its chevron rather than placed in the bar', () => {
	open();
	expect(document.querySelector('[role=menu]')?.className).toContain('fixed');
});
