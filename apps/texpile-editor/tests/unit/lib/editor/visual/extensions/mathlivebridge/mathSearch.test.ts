// @vitest-environment jsdom
// The math search Tab opens in an equation: it finds the toolbar's structures by name or by the
// commands they are made of, and takes the keys typed while it is open.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MathfieldElement } from 'mathlive';

vi.mock('$lib/editor/visual/toolbar/mathInsert', () => ({ insertSymbol: vi.fn() }));
// MathLive's own list never arrives, so only the structures are listed
vi.mock('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathEntries', () => ({
	loadMathEntries: () => new Promise(() => {}),
	searchMathEntries: vi.fn(() => [])
}));

const { insertSymbol } = await import('$lib/editor/visual/toolbar/mathInsert');
const { mathStructures, searchStructures } = await import('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathStructures');
const { mathSearch } = await import('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearch.svelte');
const { mathSearchKeydown } = await import('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearchKeys');
const { searchMathEntries } = await import('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathEntries');

/** an element standing in for a math field: what the keys read of one */
function fakeField(mode: string): MathfieldElement {
	const field = Object.assign(document.createElement('div'), { mode, syntax: 'typst', readOnly: false });
	field.addEventListener('keydown', mathSearchKeydown, { capture: true });
	document.body.append(field);
	return field as unknown as MathfieldElement;
}

function press(field: MathfieldElement, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	field.dispatchEvent(event);
	return event;
}

afterEach(() => {
	mathSearch.close();
	document.body.replaceChildren();
});

describe('the math search', () => {
	it('finds a structure by its name or by the commands it is made of', () => {
		const labels = (query: string) => searchStructures(mathStructures(), query).map((s) => s.label);
		expect(labels('frac')[0]).toBe('Fraction');
		expect(labels('fraction')[0]).toBe('Fraction');
		expect(labels('root')).toContain('Nth root');
		expect(labels('pmatrix').length).toBeGreaterThan(0);
		expect(labels('definite int')).toEqual(['Definite integral']);
	});

	it('opens on Tab in math, takes what is typed, and inserts the highlighted row on Enter', () => {
		expect(press(fakeField('latex'), 'Tab').defaultPrevented).toBe(false);
		expect(mathSearch.field).toBe(null);

		const field = fakeField('math');
		// Shift+Tab does nothing: no search, no slot back, and the focus stays
		const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
		field.dispatchEvent(shiftTab);
		expect(shiftTab.defaultPrevented).toBe(true);
		expect(mathSearch.field).toBe(null);
		expect(press(field, 'Tab').defaultPrevented).toBe(true);
		expect(mathSearch.field).toBe(field);
		for (const key of 'fracx') press(field, key);
		press(field, 'Backspace');
		expect(mathSearch.query).toBe('frac');
		press(field, 'Enter');
		expect(mathSearch.field).toBe(null);
		expect(insertSymbol).toHaveBeenCalledWith('\\frac{#@}{#0}');
	});

	it('types a Typst call after a space, which ends a name typed before the search opened', () => {
		const field = fakeField('math');
		const typed: string[] = [];
		Object.assign(field, { executeCommand: ([, key]: [string, string]) => typed.push(key) });
		press(field, 'Tab');
		mathSearch.loaded = { set: { recent: () => [], remember() {} }, entries: [], bySymbol: new Map() } as never;
		const frac = { name: 'frac', kind: 'function', insert: 'frac(', typed: true, preview: 'frac(a, b)', aliases: [] };
		vi.mocked(searchMathEntries).mockReturnValueOnce([{ command: frac, symbol: null } as never]);
		for (const key of 'qqq') press(field, key);
		press(field, 'Enter');
		expect(typed.join('')).toBe(' frac(');
	});

	it('closes on Escape, and lets a key it does not take go on to the equation', () => {
		const field = fakeField('math');
		press(field, 'Tab');
		expect(press(field, 'Escape').defaultPrevented).toBe(true);
		expect(mathSearch.field).toBe(null);
		press(field, 'Tab');
		expect(press(field, 'ArrowLeft').defaultPrevented).toBe(false);
		expect(mathSearch.field).toBe(null);
	});
});
