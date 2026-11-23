// an IEEEtran \author block on the canvas: its source stays editable, under a row of the author cards it prints
import { faceElement, setLook, type CanvasNodeViewConstructor, type FaceElement } from '$lib/editor/canvas';
import { ordinalLabel, parseIeeeAuthors, type IeeeAuthor } from './ieeeAuthor';

function card(author: IeeeAuthor, index: number): FaceElement {
	const dom = faceElement('div', 'ieee-author-card');
	setLook(dom, { minWidth: '10rem', textAlign: 'center' });
	const name = dom.appendChild(faceElement('div', 'ieee-author-name'));
	setLook(name, { fontSize: 'var(--text-sm)', fontWeight: '600' });
	if (author.ordinal) {
		const label = ordinalLabel(index + 1);
		name.append(label.slice(0, -2), faceElement('sup', '', label.slice(-2)), ' ');
	}
	name.append(author.name);
	for (const line of author.affil) {
		const affil = dom.appendChild(faceElement('div', 'ieee-author-affil', line.text));
		setLook(affil, { fontSize: 'var(--text-xs)', color: 'var(--muted-text)', ...(line.italic ? { fontStyle: 'italic' } : {}) });
	}
	return dom;
}

function rowOf(authors: IeeeAuthor[]): FaceElement {
	const row = faceElement('div', 'ieee-author-preview');
	setLook(row, {
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'center',
		columnGap: 'calc(var(--spacing) * 10)',
		rowGap: 'calc(var(--spacing) * 3)',
		padding: 'calc(var(--spacing) * 2)',
		borderBottom: '1px solid var(--color-surface-300-700)'
	});
	authors.forEach((author, i) => row.appendChild(card(author, i)));
	return row;
}

/** `island` is the block's own source view, which the cards go over */
export function ieeeAuthorChipView(island: CanvasNodeViewConstructor): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations, inner) => {
		const built = island(node, view, getPos, decorations, inner);
		const authors = parseIeeeAuthors(node.textContent);
		const shown = JSON.stringify(authors);
		if (authors?.length) built.dom.prepend(rowOf(authors));
		const { update } = built;
		built.update = (next, outer, deeper) => JSON.stringify(parseIeeeAuthors(next.textContent)) === shown && !!update?.(next, outer, deeper);
		return built;
	};
}
