// \printbibliography and #bibliography on the canvas: the heading and the references the paper cites, read from its .bib
import { untrack } from 'svelte';
import { faceElement, setLook, windowInvalidation, type CanvasNodeViewConstructor, type FaceElement } from '$lib/editor/canvas';
import { m } from '$lib/paraglide/messages';
import { referenceStore } from '$lib/stores/editorStore';
import { drawnChipView } from '../drawnChips/drawnChipView';
import { entryParts, sortedReferences } from './bibliographyEntries';
import type { BibliographyKind } from './bibliographyNodeView.svelte';

const LIMIT = 6;
const expanded = new Set<string>();
let watching = false;

function watchReferences(): void {
	if (watching || typeof window === 'undefined') return;
	watching = true;
	$effect.root(() => {
		$effect(() => {
			void referenceStore.current;
			untrack(() => windowInvalidation(window).fire({ kind: 'store', name: 'references' }));
		});
	});
}

// the DOM card's own classes lost to document.css: an editor h2 at 1.2x the text, and every paragraph with its bottom margin
const TITLE_LOOK = {
	display: 'block',
	margin: 'calc(var(--spacing) * 5) 0 calc(var(--spacing) * 2)',
	fontSize: 'calc(var(--text-base) * 1.2)',
	lineHeight: '1.375',
	fontWeight: '600',
	fontFamily: 'var(--typo-heading--font-family)'
};
const ENTRY_LOOK = { display: 'block', margin: '0 0 calc(var(--spacing) * 3)', paddingLeft: '2rem', textIndent: '-2rem' };

function entry(r: ReturnType<typeof sortedReferences>[number]): FaceElement {
	const line = faceElement('p', 'bibliography-entry');
	setLook(line, ENTRY_LOOK);
	for (const part of entryParts(r)) {
		const piece = line.appendChild(faceElement(part.look === 'title' ? 'em' : 'span', '', part.text));
		if (part.look === 'muted') setLook(piece, { color: 'var(--muted-text)' });
	}
	return line;
}

function card(heading: string): FaceElement {
	const dom = faceElement('div', 'bibliography-preview');
	setLook(dom, { display: 'block', margin: 'calc(var(--spacing) * 4) 0', borderRadius: 'var(--radius-base)' });
	const title = dom.appendChild(faceElement('h2', '', heading));
	setLook(title, TITLE_LOOK);
	const refs = sortedReferences(untrack(() => referenceStore.current) ?? []);
	if (!refs.length) {
		const empty = dom.appendChild(faceElement('p', '', m.bibliography_empty()));
		setLook(empty, { display: 'block', color: 'var(--muted-text)', fontStyle: 'italic' });
		return dom;
	}
	const list = dom.appendChild(faceElement('div', 'bibliography-entries'));
	setLook(list, { display: 'flex', flexDirection: 'column', gap: 'calc(var(--spacing) * 1.5)' });
	for (const r of expanded.has(heading) ? refs : refs.slice(0, LIMIT)) list.appendChild(entry(r));
	if (refs.length > LIMIT && !expanded.has(heading)) {
		const more = dom.appendChild(faceElement('span', 'bibliography-show-all', m.bibliography_show_all({ count: refs.length })));
		setLook(more, {
			display: 'inline-block',
			marginTop: 'calc(var(--spacing) * 2)',
			fontSize: 'var(--text-sm)',
			color: 'var(--color-primary-500)',
			textDecorationLine: 'underline',
			cursor: 'pointer'
		});
		more.on.click = () => {
			expanded.add(heading);
			windowInvalidation(window).fire({ kind: 'store', name: 'references' });
			return true;
		};
	}
	return dom;
}

/** the card in place of the command's source, which stays verbatim in the node */
export function bibliographyChipView(kind: BibliographyKind): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations) => {
		watchReferences();
		view.canvas.build.read({ kind: 'store', name: 'references' }, () => null);
		const dom = card(kind.heading(node.textContent));
		dom.hint = node.textContent.trim();
		return drawnChipView({ dom, line: true }, true, view, getPos, decorations);
	};
}
