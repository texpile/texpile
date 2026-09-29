// @vitest-environment jsdom
// a grammar suggestion offers to turn its rule off; a spelling one does not, that would take every word
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { flushSync } from 'svelte';
import { createHarperSuggestionBox } from '$lib/editor/spellcheck/suggestionBoxFactory';
import { settings, updateSettings } from '$lib/settings';
import { m } from '$lib/paraglide/messages';

const problem = (rule: string) => ({
	from: 0,
	to: 6,
	msg: 'An Oxford comma is necessary here.',
	shortmsg: 'An Oxford comma is necessary here',
	type: rule === 'SpellCheck' ? 'Spelling' : 'Style',
	replacements: ['keys,'],
	text: 'keys',
	rule
});

beforeAll(() => {
	if (!Element.prototype.animate) {
		Element.prototype.animate = (() => ({ cancel() {}, finished: Promise.resolve(), onfinish: null })) as never;
	}
});

afterEach(() => {
	document.getElementById('harper-suggestion-container')?.remove();
	updateSettings({ grammarRules: {} });
});

function open(rule: string, onClose = () => {}) {
	return createHarperSuggestionBox({
		error: problem(rule) as never,
		errors: [problem(rule) as never],
		position: { x: 10, y: 10 },
		onReplace: () => {},
		onIgnore: () => {},
		onClose,
		invalidateCache: () => {}
	});
}

function turnOffButton(): HTMLButtonElement | undefined {
	const buttons = document.querySelectorAll<HTMLButtonElement>('#harper-suggestion-container button');
	return [...buttons].find((b) => b.textContent?.includes(m.harper_turn_off_rule_button()));
}

describe('turning a rule off from its suggestion', () => {
	it('turns the rule off everywhere and closes the box', () => {
		let closed = false;
		updateSettings({ grammarRules: { AnA: false } });
		open('OxfordComma', () => (closed = true));
		const button = turnOffButton();
		expect(button).toBeDefined();
		button!.click();
		flushSync();
		expect(settings.current.grammarRules).toEqual({ AnA: false, OxfordComma: false });
		expect(closed).toBe(true);
	});

	it('is not offered for a misspelled word', () => {
		const box = open('SpellCheck');
		expect(turnOffButton()).toBeUndefined();
		box.destroy();
	});
});
