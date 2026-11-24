// @vitest-environment jsdom
// a theorem drawn on the canvas: EnvironmentHead's recorded skeleton in the head, the children in the body
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { EditorState, Plugin } from 'prosemirror-state';
import { FaceElement } from '$lib/editor/canvas';
import { domOf } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { environmentViews } from '$lib/languages/latex/visual/extensions/environment/canvas/environmentNodeView';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';
import { serializeSkeleton } from '../../../../../../tools/parity/skeletonSerializer';

const SKELETONS = path.resolve(__dirname, '../../../../../../../fixtures/parity/skeletons');

templateFeaturesStore.current = {
	...templateFeaturesStore.current,
	environmentHeads: { theorem: { text: 'Theorem', style: 'plain', numbered: true } }
};

/** the looks are inline styles of the canvas element; the recorded skeleton holds tags, classes and attributes */
function withoutStyles<T>(skeleton: T): T {
	const node = skeleton as { attrs?: Record<string, string>; children?: unknown[] };
	if (!node || typeof node !== 'object') return skeleton;
	if (node.attrs) {
		delete node.attrs.style;
		if (!Object.keys(node.attrs).length) delete node.attrs;
	}
	node.children?.forEach(withoutStyles);
	return skeleton;
}

it('draws a numbered theorem head element for element as EnvironmentHead did, its body the hole', () => {
	const theorem = schema.nodes.environment.create({ name: 'theorem' }, schema.nodes.paragraph.create(null, schema.text('Body.')));
	const doc = schema.nodes.doc.create(null, [theorem]);
	const deco = Decoration.node(0, theorem.nodeSize, {}, { numbers: ['2.1'] });
	const decorations = new Plugin({ props: { decorations: () => DecorationSet.create(doc, [deco]) } });
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [decorations] }), {
		props: { language: 'latex', nodeViews: environmentViews().nodeViews }
	});
	const root = view.nodeDOM(0) as unknown as FaceElement;
	const head = root.querySelector('.env-header')!.children[0];
	const recorded = JSON.parse(fs.readFileSync(path.join(SKELETONS, 'EnvironmentHead.json'), 'utf8'));
	expect(withoutStyles(serializeSkeleton(domOf({ dom: head }), { '2.1': 'number' }))).toEqual(recorded.states['theorem-numbered'].roots[0]);
	expect(root.querySelector('.tex-environment-body')?.style.getPropertyValue('font-style')).toBe('italic');
	expect(root.querySelector('.tex-environment-body')?.hole).toBe(true);
});
