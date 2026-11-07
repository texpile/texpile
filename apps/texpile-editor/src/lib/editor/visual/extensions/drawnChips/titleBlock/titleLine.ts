import './titleBlock.css';

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
