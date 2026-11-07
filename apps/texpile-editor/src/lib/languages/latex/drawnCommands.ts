// the commands the visual editor draws as what they print, and how the text ones look. The parser reads it too: a drawn
// command is a chip of its own, never merged with the raw code beside it
import { commonSize } from './knowledge/commands/naturalSize';
import { ACCENT_COMMANDS, SYMBOLS } from './knowledge/commands/texCharacters';
import { definesGlossaryEntries, glossaryUse } from './knowledge/commands/glossaryUse';
import { commonEnvFacts } from './knowledge/environments/envFacts';
import { verbatimCommandNames } from './knowledge/calls/verbatimCalls';
import { citationFaceCommands, citeFormOf, referencesLabel } from './knowledge/calls/citeCommands';

function sizesOf(names: string[], unit: string): Record<string, number> {
	return Object.fromEntries(
		names.flatMap((name) => {
			const size = commonSize(name, unit);
			return size === null ? [] : [[name, size]];
		})
	);
}

// points
export const VERTICAL_SKIPS = sizesOf(['smallskip', 'medskip', 'bigskip'], 'pt');
// ems; the control space is the font's interword space
export const HORIZONTAL_SPACES: Record<string, number> = {
	...sizesOf(['quad', 'qquad', 'enskip', 'enspace', 'thinspace', 'negthinspace', ',', ':', '>', ';', '!'], 'em'),
	' ': 1 / 3
};
export const PAGE_BREAKS = new Set(['newpage', 'clearpage', 'cleardoublepage', 'pagebreak']);
export const REFERENCES = new Set(['ref', 'eqref', 'cref', 'Cref', 'autoref', 'Autoref', 'pageref', 'nameref', 'Nameref', 'hyperref']);

export type Look = Partial<CSSStyleDeclaration>;
const MONO = 'var(--font-mono, monospace)';
const SANS = 'var(--font-sans, sans-serif)';
// \textbf{...} and friends, drawn around their argument
export const STYLED: Record<string, Look> = {
	textbf: { fontWeight: '700' },
	textit: { fontStyle: 'italic' },
	textsl: { fontStyle: 'italic' },
	emph: { fontStyle: 'italic' },
	texttt: { fontFamily: MONO },
	textsc: { fontVariant: 'small-caps' },
	textsf: { fontFamily: SANS },
	textrm: {},
	textup: { fontStyle: 'normal' },
	textmd: { fontWeight: '400' },
	textnormal: { fontStyle: 'normal', fontWeight: '400', fontVariant: 'normal' },
	underline: { textDecoration: 'underline' },
	uline: { textDecoration: 'underline' },
	mbox: { whiteSpace: 'nowrap' },
	hbox: { whiteSpace: 'nowrap' },
	// classicthesis; the data has no field for how a command looks
	spacedallcaps: { textTransform: 'uppercase', letterSpacing: '0.1em' },
	spacedlowsmallcaps: { textTransform: 'lowercase', fontVariant: 'small-caps', letterSpacing: '0.1em' },
	text: {},
	fbox: { border: 'var(--default-border-width) solid currentColor', padding: '0 0.2em' },
	textsuperscript: { verticalAlign: 'super', fontSize: '0.75em' },
	textsubscript: { verticalAlign: 'sub', fontSize: '0.75em' }
};
// {\bf ...} and friends: the switch styles the rest of its group
export const SWITCHES: Record<string, Look> = {
	bf: { fontWeight: '700' },
	bfseries: { fontWeight: '700' },
	it: { fontStyle: 'italic' },
	itshape: { fontStyle: 'italic' },
	em: { fontStyle: 'italic' },
	sl: { fontStyle: 'italic' },
	slshape: { fontStyle: 'italic' },
	tt: { fontFamily: MONO },
	ttfamily: { fontFamily: MONO },
	sc: { fontVariant: 'small-caps' },
	scshape: { fontVariant: 'small-caps' },
	sf: { fontFamily: SANS },
	sffamily: { fontFamily: SANS },
	rm: {},
	rmfamily: {},
	upshape: { fontStyle: 'normal' },
	mdseries: { fontWeight: '400' },
	normalfont: { fontStyle: 'normal', fontWeight: '400', fontVariant: 'normal' },
	tiny: { fontSize: '0.5em' },
	scriptsize: { fontSize: '0.7em' },
	footnotesize: { fontSize: '0.8em' },
	small: { fontSize: '0.9em' },
	normalsize: { fontSize: '1em' },
	large: { fontSize: '1.2em' },
	Large: { fontSize: '1.44em' },
	LARGE: { fontSize: '1.728em' },
	huge: { fontSize: '2.074em' },
	Huge: { fontSize: '2.488em' }
};

// a note in the margin; the data has no field for it
export const MARGIN_NOTES = new Set(['marginpar', 'marginnote', 'graffito', 'todo']);

// the commands a chip may start with and still be drawn
export const DRAWN = new Set([
	...MARGIN_NOTES,
	...Object.keys(VERTICAL_SKIPS),
	...Object.keys(HORIZONTAL_SPACES),
	...PAGE_BREAKS,
	...REFERENCES,
	...Object.keys(STYLED),
	...ACCENT_COMMANDS,
	...Object.keys(SYMBOLS),
	'vspace',
	'hspace',
	'vskip',
	'hskip',
	'vfill',
	'hfill',
	'hfil',
	'addvspace',
	'appendix',
	'bibliography',
	'bibliographystyle',
	'footnote',
	'footnotemark',
	'footnotetext',
	'texorpdfstring',
	'pause',
	'titlepage'
]);

let verbatim: Set<string> | null = null;

/** a command the editor draws: one of DRAWN, or one the data says names an acronym or takes verbatim text */
export function drawnName(name: string): boolean {
	verbatim ??= new Set(verbatimCommandNames());
	return (
		DRAWN.has(name) ||
		verbatim.has(name) ||
		glossaryUse(name) !== null ||
		citationFaceCommands().has(name) ||
		citeFormOf(name) === 'nocite' ||
		referencesLabel(name)
	);
}

// drawn on a line of their own
export const LINE_COMMANDS = new Set([
	...Object.keys(VERTICAL_SKIPS),
	...PAGE_BREAKS,
	'vspace',
	'addvspace',
	'vfill',
	'appendix',
	'bibliography',
	'bibliographystyle'
]);

/** a comment, a `{\switch` group, or the command a chip starts with */
export const HEAD = /^\s*(?:(%)|\{\s*\\([a-zA-Z@]+)|\\([a-zA-Z@]+|[^a-zA-Z@]))/;

/** starts with a command the editor draws (not a comment, which is folded code) */
export function drawnCommand(source: string): boolean {
	const head = HEAD.exec(source);
	if (!head || head[1]) return false;
	if (head[3] === 'begin') {
		const environment = /^\s*\\begin\{([^{}]+)\}/.exec(source)?.[1] ?? '';
		return commonEnvFacts(environment).body === 'comment' || definesGlossaryEntries(environment);
	}
	return head[2] ? head[2] in SWITCHES : drawnName(head[3]);
}
