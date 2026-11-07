import { untrack } from 'svelte';
import { deckPreamble, faceElement, tip, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { TITLE_PAGE_PARTS, titlePageFields } from './titlePageFields';

export function titlePageFace(source: string): ChipFace {
	const dom = faceElement('div', 'drawn-titlepage');
	const tipped = tip(dom, source);

	function show(preamble: string): void {
		const fields = titlePageFields(preamble);
		const lines = TITLE_PAGE_PARTS.filter((part) => fields[part]).map((part) => {
			const line = faceElement('div', `drawn-titlepage-${part}`, fields[part]);
			return line;
		});
		if (lines.length === 0) {
			const empty = faceElement('div', 'drawn-titlepage-empty', m.slide_titlepage_empty());
			lines.push(empty);
		}
		dom.replaceChildren(...lines);
	}
	show(untrack(() => deckPreamble.current));
	const stop = $effect.root(() => {
		$effect(() => {
			const preamble = deckPreamble.current;
			untrack(() => show(preamble));
		});
	});
	return {
		dom,
		line: true,
		destroy() {
			stop();
			tipped.destroy();
		}
	};
}
