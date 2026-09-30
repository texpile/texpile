// @vitest-environment jsdom
// the Typst panels as a reader uses them: typing into a field or flipping a switch writes the chip's new source
import { describe, expect, it, afterEach } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import TypstSetRuleSettings from '$lib/languages/typst/visual/extensions/drawn/settings/TypstSetRuleSettings.svelte';
import TypstSpacingSettings from '$lib/languages/typst/visual/extensions/drawn/settings/TypstSpacingSettings.svelte';
import TypstOutlineSettings from '$lib/languages/typst/visual/extensions/drawn/settings/TypstOutlineSettings.svelte';

let mounted: Record<string, unknown> | null = null;

afterEach(() => {
	if (mounted) unmount(mounted);
	mounted = null;
	document.body.replaceChildren();
});

function panel(settings: Component<ChipSettingsProps>, source: string): { host: HTMLElement; written: string[] } {
	const host = document.body.appendChild(document.createElement('div'));
	const written: string[] = [];
	mounted = mount(settings, {
		target: host,
		props: {
			source,
			write: (next: string) => written.push(next),
			close: () => {},
			jump: () => {},
			jumpToDefinition: () => {},
			view: {} as EditorView
		}
	});
	flushSync();
	return { host, written };
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

describe('the Typst panels', () => {
	it('a set rule field writes only its argument, and waits for a whole length', () => {
		const { host, written } = panel(TypstSetRuleSettings, '#set text(font: "Libertinus Serif", size: 11pt, fill: blue)');
		const size = host.querySelector<HTMLInputElement>('input[aria-label="Size"]')!;
		expect(size.value).toBe('11pt');
		type(size, '12');
		type(size, '12pt');
		expect(written).toEqual(['#set text(font: "Libertinus Serif", size: 12pt, fill: blue)']);
		expect(host.textContent).toContain('Also sets fill, kept as written.');
	});

	it('a switch writes its value', () => {
		const { host, written } = panel(TypstSetRuleSettings, '#set par(leading: 0.8em)');
		host.querySelector<HTMLButtonElement>('button[role="switch"]')!.click();
		flushSync();
		expect(written).toEqual(['#set par(leading: 0.8em, justify: true)']);
	});

	it('a space keeps its place on the page unless it is weak', () => {
		const { host, written } = panel(TypstSpacingSettings, '#v(1em)');
		const keep = host.querySelector<HTMLButtonElement>('button[role="switch"]')!;
		expect(keep.getAttribute('aria-checked')).toBe('true');
		keep.click();
		flushSync();
		expect(written).toEqual(['#v(1em, weak: true)']);
	});

	it('an outline lists what is picked', () => {
		const { host, written } = panel(TypstOutlineSettings, '#outline(depth: 2)');
		const figures = [...host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
			(button) => button.textContent?.trim() === 'Figures'
		)!;
		figures.click();
		flushSync();
		expect(written).toEqual(['#outline(depth: 2, target: figure.where(kind: image))']);
	});
});
