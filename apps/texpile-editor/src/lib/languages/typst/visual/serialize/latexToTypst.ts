// LaTeX -> Typst, for equations the user edited in the mathfield.
//
// NOT mathlive's own getValue('typst'): it rewrites whatever it touches into its canonical style
// (`1/3` comes back `(1)/(3)`) and turns \mathrm{d} into a bare italic `d`, so an unrelated edit
// silently changed what the equation rendered. Reaching it also meant a hidden offscreen mathfield,
// which is why this had to run while mathlive was loaded rather than at save time.
import { tex2typst } from 'tex2typst';

export function latexToTypst(latex: string): string | null {
	try {
		const out = tex2typst(latex);
		return typeof out === 'string' && out.trim() ? out.trim() : null;
	} catch {
		// tex2typst throws on input it cannot write; the caller keeps the stored source
		return null;
	}
}
