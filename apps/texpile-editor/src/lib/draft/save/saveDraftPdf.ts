export type DraftPdfSaveDeps = {
	/** the buffer on disk, with no debounced pass left to supersede the save's own */
	settleEdits: () => Promise<unknown>;
	/** a full pass; false when it left no PDF of the current source */
	compile: () => Promise<boolean>;
	save: () => Promise<{ saved: boolean; path?: string }>;
};

/** always a full pass first: an adopted patch repaints the canvas without one, so draft.pdf can trail the page */
export async function saveDraftPdf(deps: DraftPdfSaveDeps): Promise<{ saved: boolean; path?: string } | null> {
	await deps.settleEdits();
	if (!(await deps.compile())) return null;
	return deps.save();
}
