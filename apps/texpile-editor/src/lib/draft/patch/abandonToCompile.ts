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

/** abandon the instant path: announce now, highlight roughly, and hand the caller the
 *  save+compile to DEBOUNCE -- typing five refused characters must cost one pass at the
 *  pause, not five passes racing each other's supersede */
export async function abandonToCompile(
	h: AbandonHooks,
	req: PatchReq,
	stage: string,
	detail?: unknown,
	schedule?: (reason: string) => void,
	// the located band, when the caller has one: precise, and skips a synctex spawn --
	// most abandons happen AFTER locate and were re-deriving a fuzzier version of it
	band?: EditBand
): Promise<void> {
	// a TRANSIENT (auto-repaired mid-typing) edit may only patch or hold, never compile:
	// its source is a half-typed state not worth a full pass; the balanced keystroke
	// that follows re-evaluates normally
	if (req.transient) {
		h.emit('transient-hold', { stage });
		return;
	}
	h.emit('abandon', { stage, ...(typeof detail === 'object' ? detail : { detail }) });
	if (schedule) schedule('abandon:' + stage);
	else {
		await req.onRecompile?.();
		// the daemon SURVIVES this: an abandon means "this edit renders via a full pass",
		// never an engine reload (that only happens on a preamble change)
		h.compile('abandon:' + stage);
	}
	// the edit still deserves a place on the page while the full pass runs: the located
	// band when the caller has it, else a synctex box -- a highlight only needs roughly
	// the right rows. The landing compile clears it (fresh layout may have shifted it).
	if (band) {
		h.showEditBand(band, RECOMPILE_BAND_HOLD);
		h.followEdit(band.page, band.top, band.bottom, band.colL, band.colR);
	} else
		try {
			const sx: any = await h.synctex({
				action: 'view',
				pdf: h.pdfPath(),
				tex: req.file.replace(/\\/g, '/'),
				line: req.line,
				column: 0
			});
			const sb = abandonBand(((sx && sx.boxes) || []) as any[], h.paper() as any);
			if (sb) {
				h.showEditBand(sb, RECOMPILE_BAND_HOLD);
				h.followEdit(sb.page, sb.top, sb.bottom, sb.colL, sb.colR);
			}
		} catch {
			// hint only; the status line still says why
		}
	h.setStatus(m.draft_status_not_instant({ reason: whyPhrase(stage) }));
}
