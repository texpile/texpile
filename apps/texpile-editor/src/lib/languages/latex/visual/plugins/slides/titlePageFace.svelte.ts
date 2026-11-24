import { untrack } from 'svelte';
import { faceElement, setLook, windowInvalidation, type StyleLook } from '$lib/editor/canvas';
import { deckPreamble, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { TITLE_PAGE_PARTS, titlePageFields } from './titlePageFields';

const PAGE_LOOK: StyleLook = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: 'calc(var(--spacing) * 2)',
	padding: 'calc(var(--spacing) * 4) 0'
};
const PART_LOOKS: Record<string, StyleLook> = {
	title: { fontSize: '1.8rem', fontWeight: '700', lineHeight: '1.2', color: 'var(--primary-ink)' },
	subtitle: { fontSize: '1.2rem', color: 'var(--muted-text)' },
	author: { marginTop: 'calc(var(--spacing) * 3)', fontSize: '1.1rem' },
	institute: { fontSize: '0.9rem', color: 'var(--muted-text)' },
	date: { fontSize: '0.9rem', color: 'var(--muted-text)' },
	empty: { fontSize: '0.8rem', color: 'var(--faint-text)' }
};

let watching = false;

// the title page shows the deck's preamble fields, and is drawn again when they change
function watchDeckPreamble(): void {
	if (watching || typeof window === 'undefined') return;
	watching = true;
	$effect.root(() => {
		$effect(() => {
			void deckPreamble.current;
			untrack(() => windowInvalidation(window).fire({ kind: 'store', name: 'deckPreamble' }));
		});
	});
}

function partLine(part: string, text: string): ReturnType<typeof faceElement> {
	const line = faceElement('div', `drawn-titlepage-${part}`, text);
	setLook(line, { whiteSpace: 'pre-line', ...PART_LOOKS[part] });
	return line;
}

export function titlePageFace(source: string): ChipFace {
	watchDeckPreamble();
	const dom = faceElement('div', 'drawn-titlepage');
	setLook(dom, PAGE_LOOK);
	dom.hint = source;
	const fields = titlePageFields(untrack(() => deckPreamble.current));
	const parts = TITLE_PAGE_PARTS.filter((part) => fields[part]);
	for (const part of parts) dom.appendChild(partLine(part, fields[part]!));
	if (!parts.length) dom.appendChild(partLine('empty', m.slide_titlepage_empty()));
	return { dom, line: true, reads: [{ kind: 'store', name: 'deckPreamble' }] };
}
