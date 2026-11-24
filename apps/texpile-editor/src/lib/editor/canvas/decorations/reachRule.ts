// how far an inline decoration's fill reaches (9.3), where the DOM editor measured bands (rangeBands.ts)
export type DecorationReach = 'line' | 'text';

/** a shade in the selection's shape (a peer's, a held passage) fills the line box; a tint (a comment, a find) hugs the text */
export function reachOf(classes: readonly string[]): DecorationReach {
	return classes.includes('pm-range-text') ? 'line' : 'text';
}
