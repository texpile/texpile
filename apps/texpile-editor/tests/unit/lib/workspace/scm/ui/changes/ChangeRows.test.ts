// @vitest-environment jsdom
// `git rm --cached main.pdf`, the usual way to stop tracking a file, leaves git listing that path
// twice: deleted from the index, and new on disk. Keyed by path alone, the list threw.
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const { default: ChangeRows } = await import('../../../../../../../src/lib/workspace/scm/ui/changes/ChangeRows.svelte');

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

it('draws both rows git gives for one path', () => {
	app = mount(ChangeRows, {
		target: document.body.appendChild(document.createElement('div')),
		props: {
			changes: [
				{ path: '/project/main.pdf', x: 'D', y: ' ' },
				{ path: '/project/main.pdf', x: '?', y: '?' }
			],
			selected: [],
			relPath: (p: string) => p,
			baseName: (p: string) => p.split('/').pop() ?? p,
			dirName: () => '',
			onToggle: () => {},
			onOpenDiff: () => {},
			onDiscard: () => {}
		}
	});
	flushSync();
	expect(document.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
});
