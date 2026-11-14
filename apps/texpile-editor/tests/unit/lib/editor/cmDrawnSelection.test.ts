// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView as CMView } from '@codemirror/view';
import { cmDrawnSelection } from '$lib/editor/cmDrawnSelection';

function mountedRules(): string {
	return (
		[...document.querySelectorAll('style')].map((style) => style.textContent).join('\n') +
		[...(document.adoptedStyleSheets ?? [])].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n')).join('\n')
	);
}

describe('cmDrawnSelection', () => {
	// that rule restyled the whole visual editor on every change of focus; a CodeMirror that shapes drawSelection
	// otherwise would bring it back unseen
	it('hides the native selection without a rule over the descendants of a focused element', () => {
		const view = new CMView({ state: EditorState.create({ doc: 'text', extensions: [cmDrawnSelection()] }), parent: document.body });
		const rules = mountedRules();
		expect(rules).toMatch(/\.cm-line ::selection/);
		expect(rules).toMatch(/\.cm-content :focus::selection/);
		expect(rules).not.toMatch(/:focus ::selection/);
		view.destroy();
	});
});
