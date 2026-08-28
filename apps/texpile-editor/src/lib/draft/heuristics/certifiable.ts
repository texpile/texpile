import type { Cal } from '../locate/locate.types';
import type { PatchReq } from '../patch/patch.types';

// Is this edit worth asking the engine to certify? The certificate costs two or three
// daemon splits, and it can only speak for a band the skeleton actually models: a spill
// band spans two columns, a transient render carries invented closers, and float-inner,
// footnote, missing-font and command-changed patches are demoted for reasons no split can
// lift. An approx locate qualifies only when its inexactness was the band's stretched
// SPACING (approxStretch), which is precisely what the certificate replaces. Last, the
// question must matter: nothing moved and nothing to restore means nothing to certify.
export function certifiable(
	cal: Cal,
	req: PatchReq,
	f: { stretchy: boolean; footnote: boolean; fontGap: boolean; delta: number; underflow: boolean }
): boolean {
	if (!f.stretchy || cal.spill || f.footnote || f.fontGap) return false;
	if (req.transient || req.floatInner || req.cmdChanged) return false;
	if (cal.approx && !cal.approxStretch) return false;
	return f.delta !== 0 || f.underflow || !!cal.approxStretch;
}
