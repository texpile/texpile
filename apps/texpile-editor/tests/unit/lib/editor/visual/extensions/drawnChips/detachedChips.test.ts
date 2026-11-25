// @vitest-environment jsdom
// a key motion asks the policy of a chip never laid out, which builds its view detached (plan 8.3): what that costs on p2304
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { islandNodeViews } from '$lib/editor/canvas';
import { caretPolicyOf } from '$lib/editor/canvas/geometry/caretPolicy';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { registerLatexCoreDrawing } from '$lib/languages/latex/visual/core/faces/latexCoreDrawing';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parityDocumentPath } from '../../../canvas/style/parity/parityRecording';
import { createTestCanvasView } from '../../../canvas/testing/testCanvasView';

const path = parityDocumentPath('p2304', 'main.tex');

describe.skipIf(!path)('the chips of p2304 built detached', () => {
	it('answer every policy in well under a second', () => {
		registerLatexCoreDrawing();
		const { doc } = parseLatexFile(readFileSync(path!, 'utf8')) as { doc: PMNode };
		const chips: PMNode[] = [];
		doc.descendants((node) => {
			if (node.type.name === 'inline_latex' || node.type.name === 'raw_latex') chips.push(node);
		});
		const tiny = schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
		const view = createTestCanvasView(EditorState.create({ doc: tiny }), { props: { nodeViews: rawChipViews(islandNodeViews()) } });
		const start = performance.now();
		for (const chip of chips) caretPolicyOf(view, chip);
		const total = performance.now() - start;
		expect(chips.length).toBeGreaterThan(1000);
		// about 100 ms for the whole paper, 0.08 ms a chip; the keys ask the few near the caret
		expect(total).toBeLessThan(1000);
	});
});
