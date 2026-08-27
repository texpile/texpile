// Bridges mathlive's suggestion-popover re-renders so arrow keys and typing don't blink it.
//
// Upstream, every re-render DESTROYS the visible panel and builds a fresh one that sits
// display:none for 32ms until the show timeout re-adds is-visible - a visible flash on each
// keystroke and arrow press. The removal and the replacement arrive in one mutation batch,
// which is how a re-render is told apart from a first open (whose 32ms fade-in is deliberate
// and stays) and from a close. The bridge carries the old panel's position, tip classes and
// visibility onto the new one before paint, and re-scrolls the selected row into view, since
// mathlive's own scrollIntoView lives in the show-timeout branch that is-visible now skips.
// Typing keeps recentering through the render pass's deferred updateSuggestionPopoverPosition,
// which runs as long as is-visible is present.

const POPOVER_ID = 'mathlive-suggestion-popover';
const CARRIED_CLASSES = ['is-visible', 'top-tip', 'bottom-tip', 'ML__popover--reverse-direction'];

let installed = false;

/** nodeType, not `instanceof HTMLElement`: this observer outlives the document it was installed on,
 *  and cross-realm the check throws */
function popoverIn(nodes: NodeList): HTMLElement | null {
	for (const n of nodes) if (n.nodeType === 1 && (n as HTMLElement).id === POPOVER_ID) return n as HTMLElement;
	return null;
}

export function installSuggestionPopoverFlashFix(): void {
	if (installed) return;
	installed = true;
	const observer = new MutationObserver((records) => {
		let removed: HTMLElement | null = null;
		let added: HTMLElement | null = null;
		for (const r of records) {
			removed = popoverIn(r.removedNodes) ?? removed;
			added = popoverIn(r.addedNodes) ?? added;
		}
		if (!removed || !added || added === removed) return;
		if (!removed.classList.contains('is-visible')) return; // replaced before it ever showed
		added.style.top = removed.style.top;
		added.style.left = removed.style.left;
		for (const c of CARRIED_CLASSES) added.classList.toggle(c, removed.classList.contains(c));
		added.querySelector('.ML__popover__current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
	observer.observe(document.body, { childList: true });
}
