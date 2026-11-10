import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { citationCompletionSource } from '$lib/languages/latex/intellisense/completion/citations';
import { referenceStore, sourceCmView } from '$lib/stores/editorStore';
import { setPaletteActions, type PaletteActions } from '$lib/workspace/commandPalette.svelte';

// the cursor sits at the end of `doc`
function offered(doc: string): { from: number; labels: string[] } | null {
	const result = citationCompletionSource(new CompletionContext(EditorState.create({ doc }), doc.length, true));
	return result && { from: result.from, labels: result.options.map((o) => o.displayLabel ?? o.label) };
}

describe('citationCompletionSource', () => {
	beforeEach(() => {
		referenceStore.current = [{ key: 'knuth1984', entrytype: 'book' }];
	});

	it('completes the key in a later group of a multicite, after its notes', () => {
		expect(offered('\\parencites(see)()[p. 3]{a}[4]{kn')).toEqual({ from: 31, labels: ['knuth1984'] });
	});

	it('completes the last item of a list', () => {
		expect(offered('\\citep[p. 3]{a, kn')).toEqual({ from: 16, labels: ['knuth1984'] });
	});

	it('offers nothing in a command that only has cite in its name', () => {
		expect(offered('\\setcitestyle{kn')).toBeNull();
	});
});

describe('the Zotero entry', () => {
	it('is offered in a \\cite with no references yet, and opens the picker', () => {
		referenceStore.current = [];
		const insertZoteroCitation = vi.fn();
		setPaletteActions({ canZoteroCite: () => true, insertZoteroCitation } as unknown as PaletteActions);
		const doc = '\\cite{';
		const view = { state: EditorState.create({ doc }), dispatch: vi.fn() } as unknown as EditorView;
		sourceCmView.current = view;
		const result = citationCompletionSource(new CompletionContext(view.state, doc.length, false, view));
		const entry = result?.options[0];
		expect(entry?.label).toBe('Insert Citation from Zotero');
		(entry?.apply as (v: EditorView, c: unknown, from: number, to: number) => void)(view, entry, doc.length, doc.length);
		expect(insertZoteroCitation).toHaveBeenCalled();
		setPaletteActions(null);
		sourceCmView.current = null;
	});
});
