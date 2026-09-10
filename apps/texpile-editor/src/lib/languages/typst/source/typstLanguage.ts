// Typst language support: our own wasm build of the official typst-syntax parser
// (packages/typst-syntax-wasm), tagged for our theme-aware highlight style.
//
// Two things are deliberately NOT taken from codemirror-lang-typst, which this replaces:
//
//   - its parser, which is typst-syntax 0.13.1 behind a fork of the Typst repo, reinterprets the
//     wasm's output as a Lezer Tree by prototype reassignment and then mutates that tree in place
//     on every edit. Lezer trees are shared between editor states; ours builds a fresh immutable
//     one per parse via Tree.build, and tracks published Typst releases (0.15) with no fork;
//   - its colours, a hardcoded light-mode palette (black headings, deeppink keywords) that would be
//     near-invisible on our dark surface and would match no other tab.
//
// Its `typstHighlight` tag map IS reused, with thanks, but vendored into our own package rather
// than imported: that package's entry point re-exports its parser, so importing even one constant
// from it shipped a second 320KB wasm alongside ours.
import { Language, LanguageSupport, defineLanguageFacet, foldKeymap, languageDataProp } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { TypstParser, typstHighlight } from 'texpile-typst-syntax-wasm';
import { typstFold, typstFoldSections } from '../intellisense/typstFold';

/**
 * Fold RANGES and the fold keymap - deliberately NOT the gutter.
 *
 * This module is a dynamic import (it carries the wasm parser), so anything that takes up layout
 * space in here lands a second after the editor paints: a gutter shipped alongside would appear
 * late and shove the text sideways on every .typ open. The rail is therefore mounted by the host
 * editor at creation time (see SourceEditor), and what arrives with the parser is only what needs
 * the parser - the ranges.
 */
function typstFolding(): Extension {
	return [typstFoldSections, keymap.of(foldKeymap)];
}

// Typst's comment delimiters. `line` is what Mod-/ (toggleComment) actually uses: without it the
// command falls back to wrapping every line in /* */, which reads as "comment is broken" - .tex
// gets its `%` from language-data's LaTeX descriptor, and this facet is the .typ equivalent.
// the pairs and the before-set are tinymist's VS Code language configuration, `$` included: an
// unclosed `$` flips every line below it into math, so closing it as it is typed matters more
// here than for a bracket
const typstFacet = defineLanguageFacet({
	commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
	closeBrackets: { brackets: ['(', '[', '{', '"', '$'], before: ';:.,=}])>$ \t' }
});

function makeLanguage(support: Extension[]): LanguageSupport {
	// highlight tags come from the parser package (a Lezer concern); folding and the language-data
	// prop are added here because foldNodeProp/languageDataProp are CodeMirror's, and that package
	// depends on Lezer only. The languageDataProp on the TOP node is how languageDataAt finds
	// commentTokens above - it is what LRLanguage.define does for Lezer grammars, and without it
	// Mod-/ silently does nothing.
	const parser = new TypstParser(
		typstHighlight,
		typstFold,
		languageDataProp.add((type) => (type.isTop ? typstFacet : undefined))
	);
	return new LanguageSupport(new Language(typstFacet, parser, support, 'typst'));
}

/**
 * Typst syntax support. No colours of its own — cmSyntaxHighlight() supplies those.
 */
export function typstLanguage(): LanguageSupport {
	return makeLanguage([typstFolding(), closeBrackets(), keymap.of(closeBracketsKeymap)]);
}

/**
 * The language alone, for the raw islands embedded in the visual editor: a fold gutter on a
 * three-line chip reads as a stray border, so the islands get highlighting and Mod-/ only.
 * Shared instance: Language objects are immutable and safe across editors, and one wasm Source
 * serving all islands beats one per chip.
 */
let islandSupport: LanguageSupport | null = null;
export function typstIslandLanguage(): LanguageSupport {
	if (!islandSupport) islandSupport = makeLanguage([]);
	return islandSupport;
}
