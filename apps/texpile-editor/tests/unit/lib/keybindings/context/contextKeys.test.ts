// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { contextAt } from '$lib/keybindings/context/contextKeys';
import { DEFAULT_KEYBINDINGS } from '$lib/keybindings/resolver/defaultKeybindings';
import { evaluateWhen, parseWhen } from '$lib/keybindings/when/whenExpression';

function keysOn(markup: string, selector: string): { inputFocus: unknown; textInputFocus: unknown } {
	document.body.innerHTML = markup;
	const read = contextAt(document.querySelector(selector));
	return { inputFocus: read('inputFocus'), textInputFocus: read('textInputFocus') };
}

describe('contextAt', () => {
	it("a visual editor's input surface is a text input and no form field, so Alt+Z still reaches the editor", () => {
		const root = '<div class="ProseMirror" data-canvas-root><textarea data-canvas-input></textarea></div>';
		expect(keysOn(root, '[data-canvas-root]')).toEqual({ inputFocus: false, textInputFocus: true });
		expect(keysOn(root, '[data-canvas-input]')).toEqual({ inputFocus: false, textInputFocus: true });
		expect(keysOn('<textarea></textarea>', 'textarea')).toEqual({ inputFocus: true, textInputFocus: true });
	});

	it('the Zotero picker binding is live on the canvas root and on its input textarea, and off in a form field', () => {
		const when = parseWhen(DEFAULT_KEYBINDINGS.find((binding) => binding.command === 'editor.zoteroCitation')!.when!);
		const live = (markup: string, selector: string) => {
			document.body.innerHTML = markup;
			return evaluateWhen(when, contextAt(document.querySelector(selector)));
		};
		const root = '<div class="ProseMirror" data-canvas-root><textarea data-canvas-input></textarea></div>';
		expect([live(root, '[data-canvas-root]'), live(root, '[data-canvas-input]'), live('<textarea></textarea>', 'textarea')]).toEqual([
			true,
			true,
			false
		]);
	});
});
