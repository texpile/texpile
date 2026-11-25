import './titleBlock.css';
import { appendTo, type PartElement } from '../faces/partElements';

/** `make` is the composite's maker: the canvas one, or the DOM's while a part is a formula */
export function titleLine<E extends PartElement>(
	part: string,
	label: string | null,
	make: (tag: string, className?: string, text?: string) => E,
	empty = false
): E {
	const dom = make('div', `title-matter title-matter-${part}${empty ? ' title-matter-empty' : ''}`);
	if (label) appendTo(dom, make('span', `title-matter-label${part === 'abstract' ? ' title-matter-abstract-label' : ''}`, label));
	return dom;
}
