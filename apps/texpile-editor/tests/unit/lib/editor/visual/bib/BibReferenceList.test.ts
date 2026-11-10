// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BibReferenceList from '$lib/editor/visual/bib/BibReferenceList.svelte';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

it('lists a .bib that holds one key twice', () => {
	const ref = {
		key: 'lamport94',
		entrytype: 'article',
		author: 'Leslie Lamport',
		title: 'LaTeX',
		year: '1994'
	} as unknown as BiblatexReference;
	app = mount(BibReferenceList, {
		target: document.body.appendChild(document.createElement('ul')),
		props: { refs: [ref, { ...ref, title: 'LaTeX again' }], selectedKey: null, onEdit: () => {}, onDelete: () => {} }
	});
	flushSync();
	expect(document.querySelectorAll('li').length).toBe(2);
});
