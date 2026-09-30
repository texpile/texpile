// @vitest-environment jsdom
// The tree shows the open file by scrolling its row into view as it opens, and only then: a refresh
// (a compile writing files, a save, a file made outside) hands every row a new entry, and pulling
// the tree back to the open file each time lost wherever it had been scrolled to.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FileTree from '../../../../src/lib/filetree/FileTree.svelte';
import type { TreeEntry } from '../../../../src/lib/workspace/fileSystem';

function files(...names: string[]): TreeEntry[] {
	return names.map((name) => ({ name, path: `/ws/${name}`, type: 'file' as const }));
}

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;
let scrolled: string[] = [];
const props = $state({ tree: files('a.tex', 'b.tex', 'c.tex'), activePath: '/ws/a.tex' as string | null });

beforeEach(() => {
	scrolled = [];
	// jsdom draws nothing, so it has no scrollIntoView of its own
	HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
		scrolled.push(this.dataset.path ?? '');
	};
	props.tree = files('a.tex', 'b.tex', 'c.tex');
	props.activePath = '/ws/a.tex';
	host = document.body.appendChild(document.createElement('div'));
	app = mount(FileTree, {
		target: host,
		props: {
			get tree() {
				return props.tree;
			},
			get activePath() {
				return props.activePath;
			},
			rootPath: '/ws',
			onOpen: vi.fn(),
			onCreate: vi.fn(),
			onRename: vi.fn(),
			onDelete: vi.fn(),
			onMove: vi.fn()
		}
	});
	flushSync();
});
afterEach(() => {
	if (app) void unmount(app);
	host.remove();
	delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('FileTree scrolling to the open file', () => {
	it('scrolls to a file as it opens', () => {
		expect(scrolled).toEqual(['/ws/a.tex']);
		props.activePath = '/ws/c.tex';
		flushSync();
		expect(scrolled).toEqual(['/ws/a.tex', '/ws/c.tex']);
	});

	it('leaves the scroll alone when the tree refreshes', () => {
		scrolled = [];
		props.tree = files('a.tex', 'b.tex', 'c.tex', 'new.tex');
		flushSync();
		props.tree = files('a.tex', 'b.tex', 'c.tex', 'new.tex', 'main.pdf');
		flushSync();
		expect(scrolled).toEqual([]);
	});
});
