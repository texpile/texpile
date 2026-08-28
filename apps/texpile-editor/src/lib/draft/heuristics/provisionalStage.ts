// Why a band render cannot claim to be what a recompile would produce -- null = it can.
// An approx locate is placement-correct but break-inexact. A float-inner patch (tabular
// inside a \begin{table}) has exact cell content but auto column widths and float
// placement are the full pass's call. A transient (auto-repaired mid-typing) render
// carries INVENTED closers and may hold the screen for as long as the user pauses
// unbalanced, so it wears the tint too: nothing uncertified sits on screen looking final.
export type StageFacts = {
	overflow: boolean;
	underflow: boolean;
	certified: boolean;
	certFits: boolean;
	certExact: boolean;
	fullCert: boolean;
	approx: boolean;
	approxStretch: boolean;
	floatInner: boolean;
	footnote: boolean;
	fontGap: boolean;
	cmdChanged: boolean;
	transient: boolean;
};

export function provisionalStage(f: StageFacts): string | null {
	if (f.overflow) return 'overflow';
	if (f.certified && !f.certFits) return 'engine-overflow';
	if (f.underflow && !f.certified) return 'underflow';
	if (f.approx && !(f.approxStretch && f.certExact)) return 'approx-locate';
	if (f.floatInner) return 'float-inner';
	if (f.footnote) return 'footnote';
	if (f.fontGap) return 'font-missing';
	if (f.cmdChanged) return 'command-changed';
	if (f.transient) return 'transient';
	// the renderer never moves content ABOVE the band; a certificate that needs it
	// visibly moved renders the exact band and below anyway, but keeps the tint
	if (f.fullCert && !f.certExact) return 'respace-above';
	return null;
}
