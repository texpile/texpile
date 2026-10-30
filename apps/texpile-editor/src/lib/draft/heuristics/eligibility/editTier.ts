// The three-tier answer to "may this edit take the instant path":
//
//   text       only top-level running text moved -- the edit cannot reach outside the
//              paragraph, so the render may ADOPT its records and skip the compile
//   interior   only text moved, but inside unchanged structure (a heading's title, an
//              \emph body, math content, an argument). The band still renders from the
//              engine, but the text may ALSO reach elsewhere (a running head, a later use),
//              so it never adopts and a pass always follows. Whether it renders at all is
//              decided by the ENGINE's own output: see bandChanged -- an interior edit that
//              produces no band difference can only reach elsewhere, and refuses.
//   structural a command, star, environment, math span, or comment appeared, vanished, or
//              changed -- recompile.
//
// An unreadable block is structural: it must never compare equal to another unreadable one.
import { blockShapeOf } from './blockShape';

export type EditTier = 'text' | 'interior' | 'structural';

function same(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((s, i) => s === b[i]);
}

export function editTier(orig: string, text: string): EditTier {
	const a = blockShapeOf(orig);
	const b = blockShapeOf(text);
	if (!a || !b) return 'structural';
	if (same(a.structure, b.structure)) return 'text';
	if (same(a.skeleton, b.skeleton)) return 'interior';
	return 'structural';
}
