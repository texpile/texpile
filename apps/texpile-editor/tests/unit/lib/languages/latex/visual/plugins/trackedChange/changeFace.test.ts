// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { templateFeaturesStore } from '$lib/stores/editorStore';

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

describe('tracked changes written by LyX', () => {
	it('draws added and deleted text in the color of its author, with the author and date in the hint', () => {
		// the definitions LyX writes into the preamble
		const macros = {
			mklyxadded: { def: '\\textcolor{lyxadded}\\bgroup#1\\egroup', args: 1 },
			lyxadded: { def: '\\texorpdfstring{\\mklyxadded{#4}}{#4}', args: 4, optional: '' }
		};
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros };
		const added = latexFace('\\lyxadded{stoledo}{Sun Sep 28 12:32:10 2025}{a new sentence}', false)!;
		expect(added.dom.className).toBe('drawn-change drawn-change-added');
		expect(added.dom.textContent).toBe('a new sentence');
		expect(added.dom.getAttribute('data-tip')).toBe('Added by stoledo on Sun Sep 28 12:32:10 2025');
		const deleted = latexFace('\\lyxdeleted{stoledo}{Sun Sep 28 12:32:10 2025}{old words}', false)!;
		expect(deleted.dom.className).toBe('drawn-change drawn-change-deleted');
		expect(deleted.dom.style.getPropertyValue('--change-hue')).toBe(added.dom.style.getPropertyValue('--change-hue'));
		const other = latexFace('\\lyxadded{ada}{Mon Sep 29 09:00:00 2025}{text}', false)!;
		expect(other.dom.style.getPropertyValue('--change-hue')).not.toBe(added.dom.style.getPropertyValue('--change-hue'));
	});
});
