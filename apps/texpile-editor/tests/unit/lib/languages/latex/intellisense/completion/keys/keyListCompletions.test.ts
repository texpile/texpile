import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { keyListCompletions } from '$lib/languages/latex/intellisense/completion/keys/keyListCompletions';
import type { KeyedArgument } from '$lib/languages/latex/knowledge/keyCompletions';

const argument: KeyedArgument = {
	keys: [
		{ key: 'mode', values: ['fast', 'slow'] },
		{ key: 'fill', role: 'color', bare: true, placeholder: 'color' },
		{ key: 'size', placeholder: 'length' }
	],
	values: [],
	roles: []
};
const preamble = '\\usepackage[dvipsnames]{xcolor}\n\\definecolor{brand}{rgb}{1,0,0}\n';

// the list is what follows the preamble, the cursor at its end
async function offered(list: string, keyed = argument) {
	const doc = preamble + list;
	const result = await keyListCompletions({ from: preamble.length, text: list }, keyed, EditorState.create({ doc }).doc);
	return result && { from: result.from - preamble.length, labels: result.options.map((o) => o.label) };
}

describe('keyListCompletions', () => {
	it('offers the values of the key before the =, from after it', async () => {
		expect(await offered('[draw, mode=sl')).toEqual({ from: '[draw, mode='.length, labels: ['slow'] });
		expect(await offered('[size=1')).toBeNull();
	});

	it('offers the colors of a color key, after the last ! of a mix', async () => {
		const mixed = await offered('[fill=red!50!bra');
		expect(mixed).toEqual({ from: '[fill=red!50!'.length, labels: ['brand'] });
		expect((await offered('[fill='))?.labels).toEqual(expect.arrayContaining(['brand', 'teal', 'Apricot']));
	});

	it('adds the names of an argument role to its keys, colors only after a !', async () => {
		const keysAndColors: KeyedArgument = { keys: [{ key: 'thick', bare: true }], values: [], roles: ['color'] };
		expect((await offered('[thic', keysAndColors))?.labels).toEqual(['thick']);
		expect((await offered('[', keysAndColors))?.labels).toEqual(expect.arrayContaining(['thick', 'brand', 'teal']));
		expect(await offered('[thick, red!50!bra', keysAndColors)).toEqual({ from: '[thick, red!50!'.length, labels: ['brand'] });
	});
});
