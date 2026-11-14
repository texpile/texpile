// the height the handle stands at beside a block: level with its first line, as Notion's does
const TEXT_LINE = 28;
// a first character further down than this is no first line: a label inside a drawing, say
const FIRST_LINE_WITHIN = 48;

function firstCharacter(dom: Element): DOMRect | null {
	const walker = dom.ownerDocument.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
	const range = dom.ownerDocument.createRange();
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!node.textContent?.trim()) continue;
		range.setStart(node, 0);
		range.setEnd(node, 1);
		const drawn = range.getClientRects()[0];
		if (drawn?.height) return drawn;
	}
	return null;
}

/** the middle of the block's first line; a display formula has no line of text, and takes its own middle */
export function handleLineMiddle(dom: Element): number {
	const block = dom.getBoundingClientRect();
	if (dom.classList.contains('block-math-container')) return (block.top + block.bottom) / 2;
	const character = firstCharacter(dom);
	const middle = character ? (character.top + character.bottom) / 2 : null;
	if (middle !== null && middle - block.top <= FIRST_LINE_WITHIN) return middle;
	return block.top + Math.min(block.height, TEXT_LINE) / 2;
}
