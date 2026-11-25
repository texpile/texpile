// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { pointAt } from '../../geometry/geometryFixture';
import { contextClickPlan } from '$lib/editor/canvas/interaction/pointer/contextClick';
import { caretAt, labelPos, paragraph, pointerOn, words } from './pointerFixture';

const { inline_math, image, includedoc, citation } = schema.nodes;
const doc = schema.nodes.doc.create(null, [words]);

describe('contextClick', () => {
	it('a right press on a label with the caret elsewhere node-selects it and keeps the platform rule on text', () => {
		const pointer = pointerOn(doc, caretAt(1));
		const rect = pointer.geometry.nodeRect(labelPos)!.rect;
		const selected = pointer.click({ x: rect.x + 15, y: rect.y + rect.height / 2 }, { button: 2 });
		expect(selected instanceof NodeSelection && selected.from).toBe(labelPos);
		const text = pointer.click(pointAt(pointer.geometry, 3, 1), { button: 2 });
		expect(text.toJSON()).toEqual({ type: 'text', anchor: 3, head: 3 });
	});

	it('a right press inside a selection keeps it, on the atom inside it too', () => {
		const range = pointerOn(doc, (d) => TextSelection.create(d, 2, labelPos + 3));
		const rect = range.geometry.nodeRect(labelPos)!.rect;
		const kept = range.click({ x: rect.x + 15, y: rect.y + rect.height / 2 }, { button: 2 });
		expect(kept.toJSON()).toEqual({ type: 'text', anchor: 2, head: labelPos + 3 });
	});

	it('every atom kind is selected unless the press is inside the selection', () => {
		const kinds = [inline_math.create(null, schema.text('x')), image.create({ src: 'a.png' }), includedoc.create(), citation.create()];
		for (const node of kinds) {
			const state = pointerOn(schema.nodes.doc.create(null, [paragraph.create(null, [schema.text('a'), node])]), caretAt(1)).view.state;
			const hit = { inside: 2, pos: 2, caret: { pos: 2, affinity: 1 }, target: { kind: 'leaf', pos: 2, policy: 'atom' } } as never;
			expect(contextClickPlan(state, hit, 'linux').kind, node.type.name).toBe(node.isAtom ? 'node' : 'caret');
		}
	});

	it('macOS selects the word under a right press on text', () => {
		const state = pointerOn(doc, caretAt(1)).view.state;
		const hit = { inside: -1, pos: 3, caret: { pos: 3, affinity: 1 }, target: { kind: 'text', textblock: 0 } } as never;
		expect([contextClickPlan(state, hit, 'mac').kind, contextClickPlan(state, hit, 'windows').kind]).toEqual(['word', 'caret']);
	});
});

describe('the release of a right press', () => {
	/** runs a click handler on `view` like a plugin's handleClick, counting its calls */
	function countClickHandlers(view: ReturnType<typeof pointerOn>['view']): { calls: number } {
		const counter = { calls: 0 };
		Object.assign(view, {
			someProp(name: string, f?: (handler: () => boolean) => unknown) {
				if (name !== 'handleClick' && name !== 'handleClickOn') return undefined;
				counter.calls++;
				return f?.(() => false);
			}
		});
		return counter;
	}

	it('runs no click handler when the press kept the selection or selected a formula, and runs it for a plain caret move', () => {
		const range = pointerOn(doc, (d) => TextSelection.create(d, 2, labelPos + 3));
		const kept = countClickHandlers(range.view);
		const rect = range.geometry.nodeRect(labelPos)!.rect;
		range.click({ x: rect.x + 15, y: rect.y + rect.height / 2 }, { button: 2 });
		expect(kept.calls).toBe(0);

		const caret = pointerOn(doc, caretAt(1));
		const selected = countClickHandlers(caret.view);
		const label = caret.geometry.nodeRect(labelPos)!.rect;
		caret.click({ x: label.x + 15, y: label.y + label.height / 2 }, { button: 2 });
		expect(selected.calls).toBe(0);

		const moved = countClickHandlers(caret.view);
		caret.click(pointAt(caret.geometry, 3, 1), { button: 2 });
		expect(moved.calls).toBeGreaterThan(0);
	});
});
