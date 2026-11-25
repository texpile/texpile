// where the Agent panel sits, and the side panel's width and resizing
import { layout, updateLayout } from '$lib/storage/layout';
import { startDrag, nudgeOnKey, clampTo, SNAP_SLACK } from '$lib/workspace/paneResize';
import { agentUnavailable } from '../agentAvailability';
import { panelTabOff } from '../agentOffer.svelte';

export type AgentPlace = 'bottom' | 'side';

const MIN_WIDTH = 300;
const MAX_WIDTH = 900;
const clampWidth = clampTo(MIN_WIDTH, MAX_WIDTH);

/** what the window leaves the panel once the editor and the preview have their least room */
export type SideRoom = () => number;

export function sideWidthIn(width: number, room: SideRoom): number {
	return Math.max(MIN_WIDTH, Math.min(width, room()));
}

class AgentSide {
	place = $state<AgentPlace>(layout.current.agentPlace === 'side' ? 'side' : 'bottom');
	open = $state(layout.current.agentSideOpen);
	width = $state(clampWidth(layout.current.agentSideWidth));

	setOpen = (open: boolean) => {
		this.open = open;
		updateLayout({ agentSideOpen: open });
	};

	toggle = () => this.setOpen(!this.open);

	/** the side panel opens as the agent moves into it */
	moveTo = (place: AgentPlace) => {
		this.place = place;
		this.open = place === 'side';
		updateLayout({ agentPlace: place, agentSideOpen: this.open });
	};

	// raw, unclamped, as the sidebar's: dragged past the minimum it shuts
	private setWidth = (w: number, room: SideRoom) => {
		if (w < MIN_WIDTH - SNAP_SLACK) {
			if (this.open) this.setOpen(false);
			return;
		}
		if (!this.open) this.setOpen(true);
		this.width = sideWidthIn(clampWidth(w), room);
	};
	private commit = () => updateLayout({ agentSideWidth: this.width });

	startResize = (e: MouseEvent, room: SideRoom) => {
		const startX = e.clientX;
		const startW = sideWidthIn(this.width, room);
		startDrag(e, { compute: (ev) => startW + startX - ev.clientX, apply: (w) => this.setWidth(w, room), commit: this.commit });
	};

	resizeByKey = (e: KeyboardEvent, room: SideRoom) =>
		nudgeOnKey(e, {
			keys: ['ArrowRight', 'ArrowLeft'],
			step: 16,
			current: () => sideWidthIn(this.width, room),
			apply: (w) => this.setWidth(w, room),
			commit: this.commit
		});
}

export const agentSide = new AgentSide();

/** a guest, a lone file and the browser keep the tab in the Bottom Panel, which says why the agent cannot run */
export function agentInSide(): boolean {
	return agentSide.place === 'side' && !panelTabOff() && !agentUnavailable();
}
