import { expect, it } from 'vitest';
import { cetzLanguage as language } from '$lib/draw/cetz/cetzLanguage';
import { buildTree } from '$lib/draw/editor/objects/statementTree';
import { objectRows } from '$lib/draw/editor/objects/objectRows';
import type { FigureEditorState } from '$lib/draw/editor/state/editorState.svelte';

const SOURCE = '#import "@preview/cetz:0.4.2"\n#cetz.canvas({\n  import cetz.draw: *\n  circle((0, 0))\n})\n';

it("leaves CeTZ's import of its draw functions out of the objects list", () => {
	const statements = language.readPicture(SOURCE, 0)!.statements;
	const ed = {
		language,
		source: SOURCE,
		tree: buildTree(statements),
		flags: { hidden: [], locked: [], hiddenAll: new Set(), lockedAll: new Set() },
		drawingMatchesText: false,
		render: { failed: [] },
		selection: []
	} as unknown as FigureEditorState;
	expect(objectRows(ed, new Set()).map((r) => r.kind)).toEqual(['circle']);
});
