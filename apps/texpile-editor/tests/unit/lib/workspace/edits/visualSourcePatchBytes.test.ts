// a source edit patched into the visual editor writes out as the bytes it was parsed from
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseCarryKey, parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { adoptParse } from '$lib/editor/visual/parseOrigins';
import { computeBlockPatch, syncParseAttrs } from '$lib/editor/visual/blockPatch';

const BEFORE = [
	'\\documentclass{article}',
	'\\begin{document}',
	'The color of an object seems stable under changing light.',
	'We call this color constancy; see the figure.',
	'',
	'A second paragraph stays as it is.',
	'\\end{document}',
	''
].join('\n');
const AFTER = BEFORE.replaceAll('color', 'colour');

async function patched(carry: boolean): Promise<string> {
	const first = await parseLatexFile(BEFORE);
	const state = EditorState.create({ doc: first.doc, plugins: [parseCarryPlugin] });
	adoptParse(state.doc, first.origins);
	const next = await parseLatexFile(AFTER);
	const patch = computeBlockPatch(state.doc, next.doc)!;
	const tr = state.tr.replaceWith(patch.from, patch.to, patch.nodes);
	syncParseAttrs(tr, next.doc);
	if (carry) tr.setMeta(parseCarryKey, next.origins);
	return serializeLatexFile(next, state.apply(tr).doc);
}

describe('a patched-in source edit', () => {
	it('writes out the edited text as it was, where the line got longer', async () => {
		expect(await patched(true)).toBe(AFTER);
	});

	it('is rewrapped when the new document does not know the parse its blocks came from', async () => {
		// what the patch did before it carried its parse: the serializer saw the old parse only
		expect(await patched(false)).not.toBe(AFTER);
	});
});
