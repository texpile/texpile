import { expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { heldTable } from '$lib/editor/visual/extensions/table/bare/heldTable';
import { centeredTableOf, floatOf } from '$lib/editor/visual/extensions/table/bare/tableFloat';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const TABULAR = '\\begin{tabular}{|c|c|}\n\\hline\n$P_x$ & 2.5 kip \\\\\n\\hline\n\\end{tabular}';
const STRETCH = '\\renewcommand{\\arraystretch}{1.3}';

function centerOf(body: string): Node {
	const { doc } = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n\\begin{center}\n${body}\n\\end{center}\n\\end{document}\n`);
	return doc.firstChild!;
}

// the gear opened the environment's settings, and the table's were out of reach
it('takes a table after its \\arraystretch as the table its block holds, and words beside it as a block of its own', () => {
	const held = heldTable(centerOf(`${STRETCH}\n${TABULAR}`));
	expect(held?.before).toBe(STRETCH);
	expect(centerOf(`${STRETCH}\n${TABULAR}`).child(1).type.name).toBe('table');
	expect(heldTable(centerOf(TABULAR))).toEqual({ offset: 0, before: '' });
	expect(heldTable(centerOf(`Some words.\n\n${TABULAR}`))).toBeNull();
});

it('keeps the commands before the table through a caption switched on and off again', () => {
	const center = centerOf(`${STRETCH}\n${TABULAR}`);
	const { schema } = center.type;
	const table = center.child(1);
	const float = floatOf(schema, table, 'latex', heldTable(center)!.before);
	expect(float.attrs.preBody).toBe(STRETCH);
	const back = centeredTableOf(schema, table, 'latex', float.attrs.preBody);
	expect(heldTable(back)).toEqual({ offset: back.child(0).nodeSize, before: STRETCH });
});
