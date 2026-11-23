// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createTestCanvasView, testSchema } from '../testing/testCanvasView';

function recordingPlugin(name: string, log: string[], seen?: EditorView[]): Plugin {
	return new Plugin({
		view(view) {
			log.push(`create ${name}`);
			seen?.push(view);
			return {
				update: (_view, prev) => void log.push(`update ${name} ${prev.doc.textContent}`),
				destroy: () => void log.push(`destroy ${name}`)
			};
		}
	});
}

function stateWith(plugins: Plugin[]): EditorState {
	const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('a')])]);
	return EditorState.create({ doc, plugins });
}

describe('plugin views', () => {
	it('are made in plugin order, view plugins first, and updated in order with the previous state', () => {
		const log: string[] = [];
		const seen: EditorView[] = [];
		const view = createTestCanvasView(stateWith([recordingPlugin('one', log, seen), recordingPlugin('two', log)]), {
			plugins: [recordingPlugin('direct', log)]
		});
		expect(log).toEqual(['create direct', 'create one', 'create two']);
		expect(seen[0]).toBe(view);
		log.length = 0;
		view.dispatch(view.state.tr.insertText('b', 2));
		expect(log).toEqual(['update direct a', 'update one a', 'update two a']);
		view.destroy();
	});

	it('live on through updates of a view without a plugins prop', () => {
		const log: string[] = [];
		const view = createTestCanvasView(stateWith([recordingPlugin('one', log)]));
		view.dispatch(view.state.tr.insertText('b', 2));
		view.dispatch(view.state.tr.insertText('c', 3));
		expect(log).toEqual(['create one', 'update one a', 'update one ab']);
		view.destroy();
	});

	it('are destroyed and made again when the plugin list changes, and destroyed last first with the view', () => {
		const log: string[] = [];
		const one = recordingPlugin('one', log);
		const view = createTestCanvasView(stateWith([one]));
		view.updateState(view.state.reconfigure({ plugins: [one, recordingPlugin('two', log)] }));
		expect(log).toEqual(['create one', 'destroy one', 'create one', 'create two']);
		log.length = 0;
		view.destroy();
		expect(log).toEqual(['destroy two', 'destroy one']);
	});
});
