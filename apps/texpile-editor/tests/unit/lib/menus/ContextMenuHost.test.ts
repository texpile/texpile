// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ContextMenuHost from '../../../../src/lib/menus/ContextMenuHost.svelte';
import { closeContextMenu, showContextMenu } from '../../../../src/lib/menus/contextMenu.svelte';

let host: Record<string, unknown> | null = null;

afterEach(() => {
	closeContextMenu();
	if (host) unmount(host);
	host = null;
	document.body.innerHTML = '';
});

describe('the drawn context menu', () => {
	it('lets a disabled item with a tip be hovered, so it can say why', () => {
		host = mount(ContextMenuHost, { target: document.body });
		void showContextMenu(
			[
				{ label: 'Explained', disabled: true, tip: 'why not' },
				{ label: 'Silent', disabled: true }
			],
			{ x: 10, y: 10 }
		);
		flushSync();
		const [explained, silent] = [...document.querySelectorAll<HTMLButtonElement>('[role=menu] button')];
		expect(explained.disabled).toBe(true);
		expect(explained.style.pointerEvents).toBe('auto');
		expect(silent.style.pointerEvents).toBe('');
	});
});
