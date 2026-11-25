// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import { CanvasContractError } from '$lib/editor/canvas';
import { createTestCanvasView, testSchema } from '../testing/testCanvasView';

const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('a')])]);

function attributesPlugin(attrs: Record<string, string>): Plugin {
	return new Plugin({ props: { attributes: attrs } });
}

describe('the view props', () => {
	it('someProp asks the constructor props, then the view plugins, then the state plugins, until one answers', () => {
		const asked: string[] = [];
		const answer = (name: string, value: boolean) => () => (asked.push(name), value);
		const view = createTestCanvasView(EditorState.create({ doc, plugins: [new Plugin({ props: { editable: answer('state', true) } })] }), {
			plugins: [new Plugin({ props: { editable: answer('plugin', false) } })],
			props: { editable: answer('direct', false) }
		});
		asked.length = 0;
		expect(view.someProp('editable', (f) => f(view.state))).toBe(true);
		expect(asked).toEqual(['direct', 'plugin', 'state']);
		asked.length = 0;
		expect(view.someProp('editable', (f) => !f(view.state))).toBe(true);
		expect(asked).toEqual(['direct']);
		expect(view.editable).toBe(false);
	});

	it('put the attributes props on the root and keep classes the app adds', () => {
		const state = EditorState.create({ doc, plugins: [attributesPlugin({ class: 'Plugged', title: 'later', style: 'color: red' })] });
		const view = createTestCanvasView(state, { props: { attributes: { class: 'TexpileEditor', title: 'first', spellcheck: 'false' } } });
		expect([...view.dom.classList]).toEqual(expect.arrayContaining(['ProseMirror', 'TexpileEditor', 'Plugged']));
		expect(view.dom.getAttribute('title')).toBe('first');
		expect(view.dom.getAttribute('translate')).toBe('no');
		view.dom.classList.add('page-view');
		view.setProps({ attributes: { class: 'TypstEditor' } });
		expect(view.dom.classList.contains('page-view')).toBe(true);
		expect(view.dom.classList.contains('TexpileEditor')).toBe(false);
		expect(view.dom.classList.contains('TypstEditor')).toBe(true);
		expect(view.dom.getAttribute('title')).toBe('later');
	});

	it('throw on a member the canvas does not answer, in dev and test builds', () => {
		const view = createTestCanvasView(EditorState.create({ doc }));
		expect(() => (view as unknown as { docView: unknown }).docView).toThrow(CanvasContractError);
	});
});
