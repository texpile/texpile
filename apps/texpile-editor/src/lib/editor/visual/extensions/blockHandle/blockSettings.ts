// the settings a block opens from the handle's gear or the right-click menu, kept by the element the editor draws the block as
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type BlockSettings = {
	/** the gear's hint, such as Table settings */
	label(): string;
	/** `gear` is the handle's button, for the settings to open beside; with none they open where it would stand */
	open(gear?: HTMLElement): void;
	/** the block holds one block alone and opens that block's settings with its own among them, as center does for a table */
	forOnlyChild?(): boolean;
};

export type GearPlace = () => { x: number; y: number; width: number; height: number };

// the handle's gear from a block's right edge: past the gutter's gap, level with the block's first line (block-handle-plugin)
const GEAR_LEFT = 2;
const GEAR_SIZE = 22;

const offered = new WeakMap<Element, BlockSettings>();

/** returns the way to take the offer back */
export function offerBlockSettings(dom: Element, settings: BlockSettings): () => void {
	offered.set(dom, settings);
	return () => {
		if (offered.get(dom) === settings) offered.delete(dom);
	};
}

/** on a block that only wraps its body, as a figure does a grid of pictures: the handle's gear opens the body's settings */
export const PASSES_BODY_SETTINGS = 'data-passes-body-settings';

export function blockSettingsOf(dom: Element | null): BlockSettings | null {
	if (!dom) return null;
	const own = offered.get(dom);
	if (own || !dom.hasAttribute(PASSES_BODY_SETTINGS)) return own ?? null;
	for (const child of dom.children) {
		const inner = offered.get(child);
		if (inner) return inner;
	}
	return null;
}

function servedByHandle(dom: Element): boolean {
	const parent = dom.parentElement;
	if (!parent) return false;
	return parent.hasAttribute('data-block-handle') || (parent.hasAttribute(PASSES_BODY_SETTINGS) && servedByHandle(parent));
}

/** the settings of the block at `pos`, for a block whose drawing is not its own to offer them by, such as a plain table */
export type BlockSettingsProvider = (view: EditorView, pos: number) => BlockSettings | null;

const providers = new WeakMap<EditorView, Set<BlockSettingsProvider>>();

export function blockSettingsPlugin(provider: BlockSettingsProvider): Plugin {
	return new Plugin({
		view(view) {
			const set = providers.get(view) ?? new Set<BlockSettingsProvider>();
			providers.set(view, set);
			set.add(provider);
			return { destroy: () => void set.delete(provider) };
		}
	});
}

/** the settings the node at `pos` offers by its type (12.2); a block passing its body's settings offers its first child's */
function faceSettingsAt(view: EditorView, pos: number): BlockSettings | null {
	const node = view.state.doc.nodeAt(pos);
	const offer = node && view.props.blockSettings?.[node.type.name];
	if (!node || !offer || offer.offers?.(node) === false) return null;
	if (offer.passesBodySettings) {
		let inner: BlockSettings | null = null;
		node.forEach((child, offset) => (inner ??= faceSettingsAt(view, pos + 1 + offset)));
		return inner;
	}
	return {
		label: () => offer.label(node),
		open: (gear) => offer.open(pos, view, gear?.getBoundingClientRect()),
		forOnlyChild: offer.forOnlyChild && (() => offer.forOnlyChild!(node))
	};
}

export function blockSettingsAt(view: EditorView, pos: number): BlockSettings | null {
	const own = faceSettingsAt(view, pos);
	if (own) return own;
	for (const provider of providers.get(view) ?? []) {
		const found = provider(view, pos);
		if (found) return found;
	}
	return null;
}

/** the innermost block with settings at a place in the document; `inside` is posAtCoords', the node the place is in */
export function blockSettingsUnder(view: EditorView, pos: number, inside: number): BlockSettings | null {
	const $pos = view.state.doc.resolve(pos);
	const starts = inside >= 0 ? [inside] : [];
	for (let depth = $pos.depth; depth > 0; depth--) starts.push($pos.before(depth));
	for (const at of starts) {
		const found = blockSettingsAt(view, at);
		if (!found) continue;
		const $at = view.state.doc.resolve(at);
		const outer = $at.depth > 0 ? faceSettingsAt(view, $at.before()) : null;
		return outer?.forOnlyChild?.() ? outer : found;
	}
	return null;
}

// a node view's own block (one not yet drawn by a face): the middle of its first drawn character's line
function domLineMiddle(dom: Element): number {
	const block = dom.getBoundingClientRect();
	if (dom.classList.contains('block-math-container')) return (block.top + block.bottom) / 2;
	const walker = dom.ownerDocument.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
	const range = dom.ownerDocument.createRange();
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!node.textContent?.trim()) continue;
		range.setStart(node, 0);
		range.setEnd(node, 1);
		const drawn = range.getClientRects()[0];
		if (drawn?.height && (drawn.top + drawn.bottom) / 2 - block.top <= 48) return (drawn.top + drawn.bottom) / 2;
		if (drawn?.height) break;
	}
	return block.top + Math.min(block.height, 28) / 2;
}

// the gear's box from the block's top left corner
function gearOffset(dom: Element, gear?: HTMLElement): { dx: number; dy: number; width: number; height: number } {
	const block = dom.getBoundingClientRect();
	if (!gear)
		return { dx: block.width + GEAR_LEFT, dy: domLineMiddle(dom) - GEAR_SIZE / 2 - block.top, width: GEAR_SIZE, height: GEAR_SIZE };
	const at = gear.getBoundingClientRect();
	return { dx: at.left - block.left, dy: at.top - block.top, width: at.width, height: at.height };
}

/** where the gear stood beside `dom`, kept in step with the block: the handle moves on to other blocks while the settings are open */
export function gearPlaceBeside(dom: Element, gear?: HTMLElement): GearPlace {
	const { dx, dy, width, height } = gearOffset(dom, gear);
	return () => {
		const now = dom.getBoundingClientRect();
		return { x: now.left + dx, y: now.top + dy, width, height };
	};
}

/** where a block's settings open: by the handle's gear, where that gear stands when something else opens them, or null for the block's own gear */
export function settingsPlace(dom: Element, gear?: HTMLElement): GearPlace | null {
	if (!gear && !servedByHandle(dom)) return null;
	return gearPlaceBeside(dom, gear);
}

/** puts `mark`, an element inside `dom`, where the gear stands: a panel that follows an element opens by it */
export function markGearPlace(mark: HTMLElement, dom: Element, gear?: HTMLElement): void {
	const { dx, dy, width, height } = gearOffset(dom, gear);
	mark.style.setProperty('left', `${dx}px`);
	mark.style.setProperty('top', `${dy}px`);
	mark.style.setProperty('width', `${width}px`);
	mark.style.setProperty('height', `${height}px`);
}
