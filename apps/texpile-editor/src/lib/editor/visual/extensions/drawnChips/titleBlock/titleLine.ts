// one line of a title block, as the page sets it: the title large, the authors in cells, keywords after their label
import './titleBlock.css';

/** `part` names the line's look: title, subtitle, author, affiliation, date, abstract, keywords and the rest */
export function titleLine(part: string, label: string | null): HTMLElement {
	const dom = document.createElement('div');
	dom.className = `title-matter title-matter-${part}`;
	if (label) {
		const named = dom.appendChild(document.createElement('span'));
		named.className = 'title-matter-label';
		named.textContent = label;
	}
	return dom;
}
