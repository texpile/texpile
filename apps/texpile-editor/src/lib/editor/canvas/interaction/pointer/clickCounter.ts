// prosemirror-view's click counting (G1)
import { isMac } from '$lib/platform';

export type ClickKind = 'single' | 'double' | 'triple';

const CLICK_MS = 500;

type LastClick = { readonly time: number; readonly x: number; readonly y: number; readonly button: number; readonly kind: ClickKind };

/** under 500 ms, under 10 px away (dx² + dy² < 100), the same button and no node-select modifier */
export class ClickCounter {
	private last: LastClick | null = null;

	constructor(private readonly mac = isMac) {}

	next(event: MouseEvent, now = Date.now()): ClickKind {
		const { last } = this;
		const nodeSelect = this.mac ? event.metaKey : event.ctrlKey;
		const dx = last ? last.x - event.clientX : 0;
		const dy = last ? last.y - event.clientY : 0;
		const near = !!last && now - last.time < CLICK_MS && dx * dx + dy * dy < 100;
		let kind: ClickKind = 'single';
		if (near && !nodeSelect && last.button === event.button)
			kind = last.kind === 'single' ? 'double' : last.kind === 'double' ? 'triple' : 'single';
		this.last = { time: now, x: event.clientX, y: event.clientY, button: event.button, kind };
		return kind;
	}
}
