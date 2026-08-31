// heuristics/eligibility -- the ONLY question this folder answers: may this edit be sent to
// the engine's instant path at all. Nothing here models layout; nothing here decides where
// anything is drawn. Every answer is a refusal or a permission, and a refusal costs a
// recompile, never a wrong page.
//
// The rule these follow, which is what keeps them out of heuristic territory: PROVE THE
// STRUCTURE IS UNCHANGED, never enumerate what is dangerous. A blacklist of "commands that
// escape their group" can never be complete -- user macros, class-defined commands, packages
// nobody has seen. Proving the parse is identical except for text catches every construct,
// including the ones nobody thought of.
import { editTier } from './editTier';

/**
 * Did this edit change ONLY running text?
 *
 * True means every command, group, environment, math span, comment and paragraph break is
 * byte-identical between the two versions, and the difference lies entirely in prose at the
 * block's top level. Such an edit cannot reach outside the paragraph, so the daemon's
 * single-block typeset speaks for the whole document.
 *
 * False means recompile -- including when the block does not parse, which is the answer that
 * matters most: an unreadable block must never compare EQUAL to another unreadable one.
 */
export function textOnlyEdit(orig: string, text: string): boolean {
	return editTier(orig, text) === 'text';
}
