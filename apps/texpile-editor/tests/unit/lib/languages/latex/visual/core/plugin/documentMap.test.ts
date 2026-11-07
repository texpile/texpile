import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { commandImports, environmentImports, markSaves, nodeSaves } from '$lib/languages/latex/visual/core/plugin/documentMap';

// the core writes these itself; inline math and chips are their own text, and a figure group writes its caption
const WRITTEN_ELSEWHERE = ['doc', 'paragraph', 'text', 'raw_latex', 'environment', 'inline_math', 'inline_latex', 'figure_caption'];

describe('documentMap', () => {
	it('saves every node and mark of the schema, through a plugin or the core', () => {
		const nodes = Object.keys(schema.nodes).filter((name) => !WRITTEN_ELSEWHERE.includes(name) && !nodeSaves.has(name));
		// item_label marks the head of an item, which the list writes as \item[...]
		const marks = Object.keys(schema.marks).filter((name) => name !== 'item_label' && !markSaves.has(name));
		expect({ nodes, marks }).toEqual({ nodes: [], marks: [] });
	});

	it('imports the names the shared tables read before the plugins', () => {
		const commands = ['section', 'chapter', 'textbf', 'emph', 'textcolor', 'href', 'url', '\\', 'par', 'label', 'ref', 'cite', 'input'];
		const environments = ['itemize', 'figure', 'table', 'tabular', 'longtable', 'quote', 'abstract', 'frame', 'columns'];
		expect(commands.filter((name) => !commandImports.has(name))).toEqual([]);
		expect(environments.filter((name) => !environmentImports.has(name))).toEqual([]);
	});
});
