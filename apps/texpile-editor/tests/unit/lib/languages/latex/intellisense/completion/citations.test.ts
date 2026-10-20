import { beforeEach, describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { citationCompletionSource } from '$lib/languages/latex/intellisense/completion/citations';
import { referenceStore } from '$lib/stores/editorStore';

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
