import type { EditFocus } from '../heuristics/editFocus';

type FocusHooks = {
	showEditBand: (b: EditFocus, holdMs?: number) => void;
	followEdit: (page: number, top: number, bottom: number, colL?: number, colR?: number) => void;
	emit: (kind: string, detail?: unknown) => void;
};

// Highlight the edit, scroll to it, and RECORD it. The record matters: "the preview followed
// the wrong paragraph" is otherwise invisible in the decision log, which is where every other
// live-mode question gets answered, and it was reported from a screenshot rather than read off
// an event because nothing here said where the view had been sent.
export function showFocus(h: FocusHooks, f: EditFocus): void {
	h.emit('edit-focus', { page: f.page, top: +f.top.toFixed(1), bottom: +f.bottom.toFixed(1), colL: +f.colL.toFixed(1) });
	h.showEditBand(f);
	h.followEdit(f.page, f.top, f.bottom, f.colL, f.colR);
}
