// the bar over the block selected whole, a picture clicked or a block picked with the handle: its actions and its settings
import { mount, tick, unmount } from 'svelte';
import { NodeSelection, Plugin, type Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { BlockAction, VisualView } from '$lib/editor/canvas';
import { FLOATING_BAR_BOTTOM } from '$lib/editor/floatingBar';
import { visibleBox } from '../../visibleBox';
import { observe } from '$lib/runes/observe.svelte';
import { blockSettingsAt } from '../blockHandle/blockSettings';
import { chipPanel } from '../drawnChips/chipPanel/chipPanel.svelte';
import BlockBar from './BlockBar.svelte';
import { blockBarPlace } from './blockBarPlace';

export type BlockBarModel = {
	readonly actions: readonly BlockAction[];
	readonly settings: boolean;
	run(action: BlockAction): void;
	openSettings(gear: HTMLElement): void;
};

// arrows that pass over a block do not flash its bar
const SHOW_DELAY = 120;

class BlockBarView implements BlockBarModel {
	actions = $state.raw<readonly BlockAction[]>([]);
	settings = $state(false);
	private readonly host: HTMLElement;
	private readonly app: ReturnType<typeof mount>;
	private readonly stops: (() => void)[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	/** the selection a click in the bar acted on: the bar stays away until another selection or a click in the editor */
	private dismissed: Selection | null = null;
	private shownFor: number | null = null;

	constructor(private readonly view: VisualView) {
		const doc = view.dom.ownerDocument;
		this.host = doc.createElement('div');
		this.host.className = 'block-bar';
		Object.assign(this.host.style, { position: 'fixed', zIndex: '250', display: 'none' });
		// beside the editor, outside the zoom its root carries
		(view.dom.parentElement ?? doc.body).appendChild(this.host);
		this.app = mount(BlockBar, { target: this.host, props: { bar: this } });
		const win = doc.defaultView ?? window;
		win.addEventListener('scroll', this.place, true);
		view.dom.addEventListener('pointerup', this.clicked);
		this.stops.push(
			() => win.removeEventListener('scroll', this.place, true),
			() => view.dom.removeEventListener('pointerup', this.clicked),
			view.canvas.onLayout(this.place),
			observe(() => chipPanel.request, this.place)
		);
	}

	/** the block the bar is for, null when none shows one */
	private selectedBlock(): number | null {
		const { view } = this;
		const { selection } = view.state;
		// a chip's open panel holds the block's source and its actions already
		if (!view.editable || (view as unknown as EditorView).dragging || view.canvas.nested() || chipPanel.request) return null;
		if (!(selection instanceof NodeSelection) || selection.node.isInline) return null;
		if (this.dismissed?.eq(selection)) return null;
		this.dismissed = null;
		return selection.from;
	}

	// a click on the block the bar left, which sets no new selection, brings the bar back
	private readonly clicked = (): void => {
		this.dismissed = null;
		this.place();
	};

	readonly place = (): void => {
		const pos = this.selectedBlock();
		const actions = pos === null ? [] : this.view.canvas.blockActions(pos);
		const settings = pos !== null && !!blockSettingsAt(this.view as unknown as EditorView, pos);
		if (pos === null || (!actions.length && !settings)) return this.hide();
		this.shownFor = pos;
		this.actions = actions;
		this.settings = settings;
		// measured once Svelte has drawn the buttons: place runs inside effects too, where it may not flush
		void tick().then(() => this.position(pos));
	};

	private position(pos: number): void {
		if (this.selectedBlock() !== pos) return;
		const rect = this.view.canvas.nodeClientRect(pos)?.rect;
		if (!rect) return this.hide();
		const { style } = this.host;
		style.display = 'block';
		const visible = visibleBox(this.view.dom);
		const pane = { ...visible, top: visible.top + FLOATING_BAR_BOTTOM };
		// eslint-disable-next-line canvas/no-dom-measurement -- the bar's own box, not the document's
		const at = blockBarPlace(rect, pane, { width: this.host.offsetWidth, height: this.host.offsetHeight });
		if (!at) return this.hide();
		style.left = `${at.left}px`;
		style.top = `${at.top}px`;
		if (style.visibility === 'visible' || this.timer) return;
		style.visibility = 'hidden';
		this.timer = setTimeout(() => {
			this.timer = null;
			style.visibility = 'visible';
		}, SHOW_DELAY);
	}

	private hide(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		Object.assign(this.host.style, { display: 'none', visibility: '' });
	}

	private dismiss(): void {
		this.dismissed = this.view.state.selection;
		this.hide();
	}

	run(action: BlockAction): void {
		this.dismiss();
		action.run();
	}

	openSettings(gear: HTMLElement): void {
		const pos = this.shownFor ?? this.view.state.selection.from;
		blockSettingsAt(this.view as unknown as EditorView, pos)?.open(gear);
		this.dismiss();
	}

	destroy(): void {
		this.hide();
		for (const stop of this.stops) stop();
		void unmount(this.app);
		this.host.remove();
	}
}

export function blockBarPlugin(): Plugin {
	return new Plugin({
		view(view) {
			const bar = new BlockBarView(view as unknown as VisualView);
			bar.place();
			return { update: () => bar.place(), destroy: () => bar.destroy() };
		}
	});
}
