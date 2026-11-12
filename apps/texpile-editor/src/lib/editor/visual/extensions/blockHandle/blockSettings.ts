// the settings a block opens from the handle's gear, kept by the element the editor draws the block as
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type BlockSettings = {
	/** the gear's hint, such as Table settings */
	label(): string;
	/** `gear` is the handle's button, for the settings to open beside */
	open(gear: HTMLElement): void;
};

export type GearPlace = () => { x: number; y: number; width: number; height: number };

// the handle's gear from a block's top right corner: past the gutter's gap, under the delete button (block-handle-plugin)
const GEAR_LEFT = 8;
const GEAR_TOP = 24;
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

/** where the gear stood beside `dom`, kept in step with the block: the handle moves on to other blocks while the settings are open */
export function gearPlaceBeside(dom: Element, gear: HTMLElement): GearPlace {
	const block = dom.getBoundingClientRect();
	const at = gear.getBoundingClientRect();
	const [dx, dy] = [at.left - block.left, at.top - block.top];
	return () => {
		const now = dom.getBoundingClientRect();
		return { x: now.left + dx, y: now.top + dy, width: at.width, height: at.height };
	};
}

/** where a block's settings open: by the handle's gear, where that gear stands when something else opens them, or null for the block's own gear */
export function settingsPlace(dom: Element, gear?: HTMLElement): GearPlace | null {
	if (gear) return gearPlaceBeside(dom, gear);
	if (!dom.parentElement?.hasAttribute('data-block-handle')) return null;
	return () => {
		const box = dom.getBoundingClientRect();
		return { x: box.right + GEAR_LEFT, y: box.top + GEAR_TOP, width: GEAR_SIZE, height: GEAR_SIZE };
	};
}

/** puts `mark`, an element inside `dom`, where the gear stands: a panel that follows an element opens by it */
export function markGearPlace(mark: HTMLElement, dom: Element, gear: HTMLElement): void {
	const block = dom.getBoundingClientRect();
	const at = gear.getBoundingClientRect();
	mark.style.setProperty('left', `${at.left - block.left}px`);
	mark.style.setProperty('top', `${at.top - block.top}px`);
	mark.style.setProperty('width', `${at.width}px`);
	mark.style.setProperty('height', `${at.height}px`);
}
