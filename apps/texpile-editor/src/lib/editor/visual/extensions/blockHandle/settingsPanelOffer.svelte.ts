// a block's settings panel opened from the handle's gear, the context menu's Settings item or a menu entry, by the block's
// position, mounted in a placed host
import { mount, unmount, type Component } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockSettingsOffer, VisualView } from '$lib/editor/canvas';
import type { GearPlace } from './blockSettings';
import { nodeStillAt } from './nodePosition';
import { placedHost, type PlacedHost } from './placedHost';

/** the props a panel reads its block through; node is read again after each edit, so the panel shows the block as it is */
export type PanelProps = { view: VisualView; getPos(): number | undefined; readonly node: PMNode };

export type SettingsPanel<P extends object = PanelProps> = {
	nodeType: string;
	label(node: PMNode): string;
	component: Component<P>;
	/** the panel's own open export: its gear's place, or null for its default */
	opener: 'open' | 'openAt';
	/** for a panel that takes more than the block: its props, read off the block's */
	props?(block: PanelProps): P;
};

const GEAR = 22;

let current: { placed: PlacedHost; app: ReturnType<typeof mount>; stop(): void } | null = null;

function closePanel(): void {
	if (!current) return;
	current.stop();
	void unmount(current.app);
	current.placed.remove();
	current = null;
}

/** where the gear stood beside the block at `pos`, kept in step with the block while the panel is open; with no gear, its top right corner */
export function gearPlaceAt(view: VisualView, pos: number, gear?: DOMRect): GearPlace | null {
	// an inline node has no box of its own: it opens where it was pressed
	const block = view.canvas.nodeClientRect(pos)?.rect ?? gear;
	if (!block) return null;
	const at = gear ?? new DOMRect(block.right - GEAR, block.top, GEAR, GEAR);
	const dx = at.left - block.left;
	const dy = at.top - block.top;
	return () => {
		const now = view.canvas.nodeClientRect(pos)?.rect ?? block;
		return { x: now.left + dx, y: now.top + dy, width: at.width, height: at.height };
	};
}

export function settingsPanelOffer<P extends object = PanelProps>(panel: SettingsPanel<P>): BlockSettingsOffer {
	function open(pos: number, view: VisualView, gear?: DOMRect): void {
		closePanel();
		const place = gearPlaceAt(view, pos, gear);
		if (!place) return;
		const placed = placedHost(view, place);
		let edits = $state(0);
		const block: PanelProps = {
			view,
			getPos: () => (nodeStillAt(view.state.doc, pos)?.type.name === panel.nodeType ? pos : undefined),
			get node(): PMNode {
				void edits;
				return nodeStillAt(view.state.doc, pos)!;
			}
		};
		// the block gone (undone, deleted) takes its panel with it
		const stop = view.canvas.onLayout(() => (block.getPos() === undefined ? closePanel() : edits++));
		const props = panel.props ? panel.props(block) : (block as P);
		const app = mount(panel.component, { target: placed.host, props });
		current = { placed, app, stop };
		// a frame after the press: the gear stands outside the popover, so the same click would close it again
		requestAnimationFrame(() => (app as Partial<Record<SettingsPanel['opener'], (at: GearPlace) => void>>)[panel.opener]?.(place));
	}
	return { label: panel.label, open };
}
