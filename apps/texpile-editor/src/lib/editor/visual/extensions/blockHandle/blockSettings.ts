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

// the handle's gear from a block's top right corner: past the gutter's gap, on the block's first line (block-handle-plugin)
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

export function blockSettingsOf(dom: Element | null): BlockSettings | null {
	return (dom && offered.get(dom)) ?? null;
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

export function blockSettingsAt(view: EditorView, pos: number, dom: Element | null): BlockSettings | null {
	const own = blockSettingsOf(dom);
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
		const dom = view.nodeDOM(at);
		const found = blockSettingsAt(view, at, dom instanceof Element ? dom : null);
		if (!found) continue;
		const $at = view.state.doc.resolve(at);
		const around = $at.depth > 0 ? view.nodeDOM($at.before()) : null;
		const outer = around instanceof Element ? blockSettingsOf(around) : null;
		return outer?.forOnlyChild?.() ? outer : found;
	}
	return null;
}

// the gear's box from the block's top left corner
function gearOffset(dom: Element, gear?: HTMLElement): { dx: number; dy: number; width: number; height: number } {
	const block = dom.getBoundingClientRect();
	if (!gear) return { dx: block.width + GEAR_LEFT, dy: 0, width: GEAR_SIZE, height: GEAR_SIZE };
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
	if (!gear && !dom.parentElement?.hasAttribute('data-block-handle')) return null;
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
