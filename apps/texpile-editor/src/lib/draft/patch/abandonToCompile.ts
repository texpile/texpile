/* eslint-disable @typescript-eslint/no-explicit-any */
import { abandonBand } from '../heuristics/abandonBand';
import { whyPhrase } from '../whyPhrase';
import type { EditBand } from '../draftViewport.svelte';
import type { PaperMetrics } from '../locate/locate.types';
import type { PatchReq } from './patch.types';
import { m } from '$lib/paraglide/messages';

// a recompile-bound highlight must survive until the compile lands (which clears it);
// long documents can take several seconds, and an early fade reads as "nothing happened"
const RECOMPILE_BAND_HOLD = 8000;

export type AbandonHooks = {
	synctex: (body: Record<string, unknown>) => Promise<any>;
	pdfPath: () => string;
	paper: () => PaperMetrics;
	showEditBand: (b: EditBand, holdMs?: number) => void;
	followEdit: (page: number, top: number, bottom: number, colL?: number, colR?: number) => void;
	setStatus: (s: string) => void;
	compile: (reason: string) => void;
	emit: (kind: string, detail?: unknown) => void;
};

/** abandon the instant path: save via onRecompile, highlight roughly, run the full pass */
export async function abandonToCompile(h: AbandonHooks, req: PatchReq, stage: string, detail?: unknown): Promise<void> {
	// a TRANSIENT (auto-repaired mid-typing) edit may only patch or hold, never compile:
	// its source is a half-typed state not worth a full pass; the balanced keystroke
	// that follows re-evaluates normally
	if (req.transient) {
		h.emit('transient-hold', { stage });
		return;
	}
	h.emit('abandon', { stage, ...(typeof detail === 'object' ? detail : { detail }) });
	await req.onRecompile?.();
	// the edit still deserves a place on the page while the full pass runs: synctex
	// is too fuzzy to anchor a splice, but a highlight only needs roughly the right
	// rows. The landing compile clears the band (fresh layout may have shifted it).
	try {
		const sx: any = await h.synctex({
			action: 'view',
			pdf: h.pdfPath(),
			tex: req.file.replace(/\\/g, '/'),
			line: req.line,
			column: 0
		});
		const band = abandonBand(((sx && sx.boxes) || []) as any[], h.paper() as any);
		if (band) {
			h.showEditBand(band, RECOMPILE_BAND_HOLD);
			h.followEdit(band.page, band.top, band.bottom, band.colL, band.colR);
		}
	} catch {
		// hint only; the status line still says why
	}
	// the daemon SURVIVES this: an abandon means "this edit renders via a full pass",
	// never an engine reload (that only happens on a preamble change)
	h.setStatus(m.draft_status_not_instant({ reason: whyPhrase(stage) }));
	h.compile('abandon:' + stage);
}
