import './glossaryTerm.css';

export function showGlossaryTerm(dom: HTMLElement, text: string, missing: boolean): void {
	dom.classList.add('drawn-glossary');
	dom.classList.toggle('drawn-glossary-missing', missing);
	// written again as it was, it reads as a change of size to the line breaker
	if (dom.textContent !== text) dom.replaceChildren(text);
}
