// Draws a math search row's preview with MathLive, once the row scrolls into sight: the list holds
// everything there is, far more rows than are worth drawing up front, and each drawing is kept.
import type { ActionReturn } from 'svelte/action';
import type { MathSyntax } from '../mathFieldFactory';

type Preview = { source: string; syntax: MathSyntax };

const drawn = new Map<string, string>();
const waiting = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;
// mathlive loads lazily so a static edge here can't drag it into the eager bundle
let mathlive: Promise<typeof import('mathlive')> | null = null;

async function markupOf({ source, syntax }: Preview): Promise<string> {
	const key = `${syntax} ${source}`;
	let markup = drawn.get(key);
	if (markup === undefined) {
		const ml = await (mathlive ??= import('mathlive'));
		try {
			markup = syntax === 'typst' ? ml.convertTypstToMarkup(source) : ml.convertLatexToMarkup(source);
		} catch {
			markup = '';
		}
		drawn.set(key, markup);
	}
	return markup;
}

function watch(el: Element, draw: () => void): void {
	observer ??= new IntersectionObserver((seen) => {
		for (const { target, isIntersecting } of seen) {
			if (!isIntersecting) continue;
			waiting.get(target)?.();
			waiting.delete(target);
			observer?.unobserve(target);
		}
	});
	waiting.set(el, draw);
	observer.observe(el);
}

function forget(el: Element): void {
	waiting.delete(el);
	observer?.unobserve(el);
}

export function drawMath(el: HTMLElement, preview: Preview): ActionReturn<Preview> {
	let current = preview;
	function draw() {
		const wanted = current;
		void markupOf(wanted).then((markup) => {
			// MathLive's own markup for a name from its own table, never what was typed
			// eslint-disable-next-line no-param-reassign -- an action draws into the element it is given
			if (el.isConnected && current === wanted) el.innerHTML = markup;
		});
	}
	watch(el, draw);
	return {
		update(next) {
			current = next;
			// eslint-disable-next-line no-param-reassign -- an action draws into the element it is given
			el.innerHTML = '';
			watch(el, draw);
		},
		destroy() {
			forget(el);
		}
	};
}
