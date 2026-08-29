// May this band's overflow be rendered by moving content into the next column or page?
//
// Only when the band is column text. A band inside a FLOAT sits in a box the page builder
// places whole: if it no longer fits, TeX re-places the float, it does not spill the float's
// contents down the page. A split there moves material the engine would never move --
// measured on a table at a column bottom, editing one cell sent the float's own caption to
// the next page, and the caption's old position rendered blank. Painting the new box in
// place and letting the reconcile settle the float is the honest render.
export function bandCanSpill(f: { overflow: boolean; certFits: boolean; floatInner: boolean }): boolean {
	return f.overflow && !f.certFits && !f.floatInner;
}
