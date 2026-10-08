// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { visualCollabBridge } from '$lib/collab/workspaceSession';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { VisualParser } from '$lib/workspace/visualParse.svelte';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const before = '\\documentclass{article}\n\\begin{document}\nWe prove the estimator is sharp.\n\\end{document}\n';
const after = before.replace('sharp', 'blunt');

// suggestions and new comments are placed through this map, and a collaborator's patch moved the text under it
it('takes the map of a collaborator’s patch along with its text', () => {
	const doc = new DocumentBuffer({
		scheduleSave: () => {},
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	doc.openTex('C:/ws/main.tex', before, '\n');
	doc.adoptParsed(parseLatexFile(before), before);
	const api = visualCollabBridge({ doc, parser: new VisualParser(() => ''), parse: async () => ({}), scheduleSave: () => {} });
	const parsed = parseLatexFile(after);
	api.texSource = after;
	api.adopt(parsed, parsed.doc);
	expect(doc.sourceMap).toBe(parsed.map);
});
