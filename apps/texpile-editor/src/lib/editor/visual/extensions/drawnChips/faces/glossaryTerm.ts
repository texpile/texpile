import './glossaryTerm.css';

/** shows a glossary term in `dom` as the text it prints; `missing` when no entry defines it */
export function showGlossaryTerm(dom: HTMLElement, text: string, missing: boolean): void {
	dom.classList.add('drawn-glossary');
	dom.classList.toggle('drawn-glossary-missing', missing);
	dom.replaceChildren(text);
}
