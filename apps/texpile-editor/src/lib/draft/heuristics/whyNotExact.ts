// Why a band render cannot claim to be what a recompile would produce -- null = it can.
// There are two outcomes and no third: a null here renders, anything else abandons to the
// full pass. The tinted middle tier this used to feed was measured at 62-66% wrong against
// the reconcile, so an unproven render is not shown at all.
// An approx locate is placement-correct but break-inexact. A float-inner patch (tabular
// inside a \begin{table}) has exact cell content but auto column widths and float
// placement are the full pass's call. A transient (auto-repaired mid-typing) render
// carries INVENTED closers, so it cannot speak for the user's source either.
export type ExactFacts = {
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
	// the page's glue is set off natural AND this column packed to its goal: only then does
	// growth make the engine re-set the column instead of pushing its tail down. A ragged
	// column absorbs growth in the fil at its foot, where a rigid push IS the engine's answer.
	stretchy: boolean;
	packed: boolean;
	grew: boolean;
};

export function whyNotExact(f: ExactFacts): string | null {
	// `overflow` is JS arithmetic on predicted line positions, and it used to refuse before the
	// engine's answer was consulted at all -- so a page the certificate had just PROVED still
	// holds its content was refused anyway on the strength of the prediction that disagreed
	// with it. It only speaks when the certificate did not: certExact means the split
	// certified the fit AND the render is carrying the engine's own baselines.
	if (f.overflow && !f.certExact) return 'overflow';
	if (f.certified && !f.certFits) return 'engine-overflow';
	// A grown band in a column the engine PACKED, on a page whose glue it set off natural: the
	// growth is answered by re-setting that glue, not by pushing the tail down, and respacing
	// is the one thing the renderer cannot do. `fits` does not decide it -- that answers
	// whether the page still holds the content, not where the content lands -- so only a full
	// certificate carrying the engine's own baselines licenses the render. Without one the
	// frame was riding on the JS slack estimate, which says nothing about how the glue re-set.
	if (f.stretchy && f.packed && f.grew && !f.certExact) return 'unset-glue';
	if (f.underflow && !f.certified) return 'underflow';
	if (f.approx && !(f.approxStretch && f.certExact)) return 'approx-locate';
	if (f.floatInner) return 'float-inner';
	if (f.footnote) return 'footnote';
	if (f.fontGap) return 'font-missing';
	if (f.cmdChanged) return 'command-changed';
	if (f.transient) return 'transient';
	// a certificate that needs the region ABOVE the band moved renders those rows from the
	// engine's own steps; without the remap there is nothing to place them by
	if (f.fullCert && !f.certExact) return 'respace-above';
	return null;
}
