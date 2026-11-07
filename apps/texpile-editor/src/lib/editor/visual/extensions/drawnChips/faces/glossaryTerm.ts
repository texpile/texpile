import './glossaryTerm.css';

export function showGlossaryTerm(dom: HTMLElement, text: string, missing: boolean): void {
	dom.classList.add('drawn-glossary');
	dom.classList.toggle('drawn-glossary-missing', missing);
	dom.replaceChildren(text);
}
