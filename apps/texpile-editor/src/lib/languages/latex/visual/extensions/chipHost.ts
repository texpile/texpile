// the span an atom of running text (a label, a citation) mounts its chip in
export function chipHost(): HTMLElement {
	const host = document.createElement('span');
	host.className = 'chip-host';
	return host;
}

/** empties the whitespace the chip's template leaves beside it: justified text stretches every space, even one sized 0 */
export function quietTemplateSpaces(host: HTMLElement): void {
	for (const node of host.childNodes) if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) node.textContent = '';
}
