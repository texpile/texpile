// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { snapToSavedFile } from '$lib/workspace/edits/savedFileSnap';

const SRC =
	'\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\begin{tabular}{ll}\nMethod & Score \\\\\nOurs & 1 \\\\\n\\end{tabular}\n\nAfter.\n\\end{document}\n';

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

// a pasted table's first row as header cells, which a LaTeX file cannot hold
function withHeaderRow(node: PMNode): PMNode {
	if (node.type.name === 'table') {
		const header = node.type.schema.nodes.table_header;
		const rows: PMNode[] = [];
		node.forEach((row, _o, i) => {
			const cells: PMNode[] = [];
			row.forEach((cell) => cells.push(i === 0 ? header.create(cell.attrs, cell.content, cell.marks) : cell));
			rows.push(row.copy(Fragment.fromArray(cells)));
		});
		return node.copy(Fragment.fromArray(rows));
	}
	if (node.isLeaf) return node;
	const kids: PMNode[] = [];
	node.forEach((child) => kids.push(withHeaderRow(child)));
	return node.copy(Fragment.fromArray(kids));
}

function headerCells(doc: PMNode): number {
	let n = 0;
	doc.descendants((node) => void (node.type.name === 'table_header' && n++));
	return n;
}

it('takes the saved file into the editor where it reads otherwise, and leaves the rest as it is', async () => {
	const buffer = new DocumentBuffer({
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	const parsed = parseLatexFile(SRC);
	buffer.openTex('C:/ws/main.tex', SRC, '\n');
	buffer.adoptParsed(parsed, SRC);
	const shown = withHeaderRow(parsed.doc);
	expect(headerCells(shown)).toBe(2);
	view = new EditorView(document.body.appendChild(document.createElement('div')), { state: EditorState.create({ doc: shown }) });
	buffer.onVisualChange(view.state.doc);
	const saved = buffer.texSource;
	const kept = view.state.doc.child(0);

	expect(await snapToSavedFile(view, buffer, async (t) => parseLatexFile(t), saved)).toBe(true);
	expect(headerCells(view.state.doc)).toBe(0);
	expect(view.state.doc.child(0)).toBe(kept);
	expect(buffer.texSource).toBe(saved);
	expect(buffer.lastDocSource).toBe(saved);
	expect(buffer.textOf(view.state.doc)).toBe(saved);
});

it('leaves nothing to snap on the next save', async () => {
	const differing: string[] = [];
	const buffer = new DocumentBuffer({
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {},
		reparse: async (text) => parseLatexFile(text).doc,
		savedReadsOtherwise: (_text, difference) => differing.push(difference)
	});
	const parsed = parseLatexFile(SRC);
	buffer.openTex('C:/ws/main.tex', SRC, '\n');
	buffer.adoptParsed(parsed, SRC);
	view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: withHeaderRow(parsed.doc) })
	});
	buffer.onVisualChange(view.state.doc);
	await buffer.verifyForWrite('C:/ws/main.tex', buffer.texSource);
	expect(differing).toHaveLength(1);
	expect(await snapToSavedFile(view, buffer, async (t) => parseLatexFile(t), buffer.texSource)).toBe(true);
	await buffer.verifyForWrite('C:/ws/main.tex', buffer.texSource);
	expect(differing).toHaveLength(1);
});
