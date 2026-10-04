// LaTeX alignments MathLive has no structure for, as the one that sets the same lines in Typst:
// alignat's argument only counts its pairs, and flalign only pushes them to the margins

const PAIRS =
  /\\begin\{(alignat|alignedat)(\*?)\}\s*(?:\[[tbc]\]\s*)?\{\s*\d+\s*\}/g;
const ALIGNMENTS = /\\(begin|end)\{(alignat|alignedat|flalign)(\*?)\}/g;

/** `latex` with alignat and flalign written as align, and alignedat as aligned */
export function asTypstAlignments(latex: string): string {
  return latex
    .replace(PAIRS, '\\begin{$1$2}')
    .replace(
      ALIGNMENTS,
      (_, side: string, name: string, star: string) =>
        `\\${side}{${name === 'alignedat' ? 'aligned' : 'align'}${star}}`
    );
}
