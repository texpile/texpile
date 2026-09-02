// The one hover hint in the app: `use:tip={text}` marks any element as having one, TooltipHost
// draws it. Replaces both the native `title` attribute and per-trigger Skeleton tooltips.
//
// One shared card driven by an action, not a component per trigger: the math symbol panels put
// hundreds of hinted buttons on screen at once, and only one of them can ever be hovered.
import { box } from '$lib/runes/box.svelte';

export type ShownTip = { text: string; rect: DOMRect };

export const shownTip = box<ShownTip | null>(null);

const OPEN_DELAY = 400;
// once a hint has been shown the next one follows instantly for a moment: sweeping along a
// toolbar row should not re-serve the delay at every button
const WARM_MS = 600;

let timer: ReturnType<typeof setTimeout> | undefined;
let warmUntil = 0;
let armed: HTMLElement | null = null;
let owner: HTMLElement | null = null;

export function hideTip(): void {
	clearTimeout(timer);
	armed = null;
	if (shownTip.current) warmUntil = Date.now() + WARM_MS;
	shownTip.current = null;
	owner = null;
}

function show(node: HTMLElement, text: string): void {
	armed = null;
	owner = node;
	shownTip.current = { text, rect: node.getBoundingClientRect() };
}

export function tip(node: HTMLElement, text: string | null | undefined) {
	let current = text ?? '';

	// what `title` gave an icon-only control for free. Only when nothing else names it: on a
	// button with a label, `title` was a description and an aria-label would shadow the label.
	const unnamed = !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby') && !node.textContent?.trim();

	// data-tip is where `title` used to be: the hint stays readable in devtools and assertable in
	// tests, without the browser drawing its own box over ours
	function mark(text: string) {
		if (text) node.setAttribute('data-tip', text);
		else node.removeAttribute('data-tip');
		if (!unnamed) return;
		if (text) node.setAttribute('aria-label', text);
		else node.removeAttribute('aria-label');
	}
	mark(current);

	function open(instant: boolean) {
		if (!current) return;
		clearTimeout(timer);
		if (instant || Date.now() < warmUntil) return show(node, current);
		armed = node;
		timer = setTimeout(() => show(node, current), OPEN_DELAY);
	}

	function close() {
		if (armed === node) {
			clearTimeout(timer);
			armed = null;
		}
		if (owner === node) hideTip();
	}

	const onenter = (e: PointerEvent) => e.pointerType !== 'touch' && open(false);
	// a text field always matches :focus-visible, and a card over the box you are typing in is
	// not a hint, it is an obstacle
	const typable = /^(input|textarea)$/i.test(node.tagName) || node.isContentEditable;
	const onfocus = () => !typable && node.matches(':focus-visible') && open(true);

	node.addEventListener('pointerenter', onenter);
	node.addEventListener('pointerleave', close);
	node.addEventListener('pointerdown', close);
	node.addEventListener('focus', onfocus);
	node.addEventListener('blur', close);

	return {
		update(next: string | null | undefined) {
			current = next ?? '';
			mark(current);
			if (owner !== node) return;
			if (current) shownTip.current = { text: current, rect: node.getBoundingClientRect() };
			else hideTip();
		},
		destroy() {
			close();
			node.removeEventListener('pointerenter', onenter);
			node.removeEventListener('pointerleave', close);
			node.removeEventListener('pointerdown', close);
			node.removeEventListener('focus', onfocus);
			node.removeEventListener('blur', close);
		}
	};
}
