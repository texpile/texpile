import { faceElement, generatedPart, setLook, type FaceElement, type StyleLook } from '$lib/editor/canvas';
import { faceOfParts, type ChipFace } from '$lib/languages/latex/visual/core';

export type ListItemParts = { label: ChipFace[] | null; body: ChipFace[] };

const HINT_LENGTH = 400;
const MARKER_LOOK: StyleLook = { position: 'absolute', right: '100%', paddingRight: '0.5em', fontVariantNumeric: 'tabular-nums' };

function tagOf(name: string): 'ol' | 'ul' | 'dl' {
	if (name === 'enumerate') return 'ol';
	return name === 'description' ? 'dl' : 'ul';
}

export function listEnvironmentFace(name: string, items: ListItemParts[], source: string): ChipFace | null {
	const tag = tagOf(name);
	const dom = faceElement(tag, `drawn-list drawn-list-${tag}`);
	setLook(dom, { display: 'block', margin: 'calc(var(--spacing) * 1.5) 0', paddingLeft: tag === 'dl' ? '0' : '1.5em' });
	const owned: ChipFace[] = [];
	function fill(parent: FaceElement, parts: ChipFace[]): boolean {
		const face = faceOfParts(parts, false);
		owned.push(face);
		parent.appendChild(face.dom);
		return true;
	}
	for (const [index, { label, body }] of items.entries()) {
		let drawn = true;
		if (tag === 'dl') {
			if (label) {
				const term = dom.appendChild(faceElement('dt'));
				setLook(term, { display: 'block', fontWeight: '700' });
				drawn &&= fill(term, label);
			}
			const detail = dom.appendChild(faceElement('dd'));
			setLook(detail, { display: 'block', marginLeft: '1.5em' });
			drawn &&= fill(detail, body);
		} else {
			const item = dom.appendChild(faceElement('li'));
			setLook(item, { display: 'block', position: 'relative' });
			item.generatedMarker = generatedPart(tag === 'ol' ? `${index + 1}.` : '•', MARKER_LOOK);
			if (label) drawn &&= fill(item.appendChild(faceElement('strong')), label);
			drawn &&= fill(item, body);
		}
		if (!drawn) {
			owned.forEach((face) => face.destroy?.());
			return null;
		}
	}
	const hint = source.replace(/\s+/g, ' ').trim();
	dom.hint = hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint;
	return {
		dom,
		line: true,
		decorate: (decorations) => owned.forEach((face) => face.decorate?.(decorations)),
		destroy: () => owned.forEach((face) => face.destroy?.())
	};
}
