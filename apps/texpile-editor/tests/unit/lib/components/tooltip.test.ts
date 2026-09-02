// @vitest-environment jsdom
//
// The app has exactly one tooltip: `use:tip` marks a trigger, TooltipHost draws the card. The rule
// guarded here is that the card actually becomes VISIBLE. It is rendered at opacity 0 until the
// effect has measured it against the trigger it belongs to, and that check compares the shown tip
// by identity - which a plain $state would defeat by handing back a proxy, leaving every tooltip
// in the app positioned correctly and permanently invisible.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TooltipHost from '../../../../src/lib/components/TooltipHost.svelte';
import { tip, hideTip } from '../../../../src/lib/components/tooltip.svelte';

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;

const card = () => document.querySelector('[role="tooltip"]');
const enter = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('pointerenter'));

function trigger(text: string, label?: string) {
	const el = document.createElement('button');
	if (label) el.setAttribute('aria-label', label);
	document.body.appendChild(el);
	return { el, action: tip(el, text) };
}

beforeEach(() => {
	vi.useFakeTimers();
	host = document.createElement('div');
	document.body.appendChild(host);
	app = mount(TooltipHost, { target: host }) as Record<string, unknown>;
	flushSync();
});

afterEach(() => {
	hideTip();
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
	vi.useRealTimers();
});

describe('the one tooltip', () => {
	it('shows the trigger text after the hover delay, and shows it visibly', () => {
		const { el } = trigger('Rebuild the document');
		enter(el);
		flushSync();
		expect(card()).toBeNull();

		vi.advanceTimersByTime(400);
		flushSync();
		expect(card()?.textContent?.trim()).toBe('Rebuild the document');
		expect(card()?.getAttribute('style')).toContain('opacity: 1');
	});

	it('takes over what title gave: a data-tip to read, and a name for an icon-only control', () => {
		const { el } = trigger('Close the panel');
		expect(el.getAttribute('data-tip')).toBe('Close the panel');
		expect(el.getAttribute('aria-label')).toBe('Close the panel');

		// a control that already has a name keeps it: title was a description there, not the name
		const named = trigger('Close the panel', 'Close');
		expect(named.el.getAttribute('aria-label')).toBe('Close');
	});

	it('gets out of the way when the trigger is clicked', () => {
		const { el } = trigger('Rebuild the document');
		enter(el);
		vi.advanceTimersByTime(400);
		flushSync();
		expect(card()).not.toBeNull();

		el.dispatchEvent(new MouseEvent('pointerdown'));
		flushSync();
		expect(card()).toBeNull();
	});
});
