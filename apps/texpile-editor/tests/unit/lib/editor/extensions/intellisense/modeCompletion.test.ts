import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { latexCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/dispatch';
import { settings, updateSettings } from '../../../../../../src/lib/settings';

// the cursor is at the end, or at the | when there is one
async function offered(marked: string) {
	const at = marked.includes('|') ? marked.indexOf('|') : marked.length;
	const doc = marked.replaceAll('|', '');
	const r = await latexCompletionSource(new CompletionContext(EditorState.create({ doc }), at, false));
	return new Map((r?.options ?? []).map((o) => [o.label, o]));
}

afterEach(() => updateSettings({ completionByMode: true }));

describe('completion by mode', () => {
	it('offers \\alpha in math and leaves it out of plain text', async () => {
		expect((await offered('plain text \\alph')).has('\\alpha')).toBe(false);
		expect((await offered('plain text $x + \\alph')).has('\\alpha')).toBe(true);
	});

	it('ranks a text-only command after the math commands inside math', async () => {
		const inMath = await offered('$x + \\');
		const text = inMath.get('\\bfseries');
		expect(text).toBeDefined();
		expect(text!.boost ?? 0).toBeLessThan(inMath.get('\\alpha')!.boost ?? 0);
		expect((await offered('text \\')).get('\\bfseries')?.boost ?? 0).toBe(0);
	});

	it('counts the argument of \\text inside math as text', async () => {
		const inside = await offered('$x \\text{ and \\');
		expect(inside.has('\\bfseries')).toBe(true);
		expect(inside.has('\\alpha')).toBe(false);
		expect((await offered('$x \\text{ and } \\')).has('\\alpha')).toBe(true);
	});

	it('filters nothing where the mode is unknown', async () => {
		expect((await offered('\\newcommand{\\vect}[1]{\\alph')).has('\\alpha')).toBe(true);
		expect((await offered('\\alph|\n\\begin{document}\n')).has('\\alpha')).toBe(true);
		expect((await offered('\\begin{document}\n\\alph|')).has('\\alpha')).toBe(false);
		expect((await offered('a $ b\n\\end{align}\n\\alph')).has('\\alpha')).toBe(true);
	});

	it('offers \\alpha in text with the setting off', async () => {
		updateSettings({ completionByMode: false });
		expect(settings.current.completionByMode).toBe(false);
		expect((await offered('plain text \\alph')).has('\\alpha')).toBe(true);
	});
});
