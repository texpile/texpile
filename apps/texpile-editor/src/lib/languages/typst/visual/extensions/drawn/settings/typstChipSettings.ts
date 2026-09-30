// the settings a Typst chip's panel shows, when the chip is one call they can hold exactly; else the panel is its Typst
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readComment } from '$lib/editor/visual/extensions/drawnChips/commentLines';
import CommentSettings from '$lib/editor/visual/extensions/drawnChips/CommentSettings.svelte';
import { readFootnote } from '../footnoteCall';
import { readBreak } from '../breakCall';
import { readSpacing } from '../spacingCall';
import { readOutline } from '../outlineCall';
import { readSetRule } from '../setRule/setRuleCall';
import TypstFootnoteSettings from './TypstFootnoteSettings.svelte';
import TypstBreakSettings from './TypstBreakSettings.svelte';
import TypstSpacingSettings from './TypstSpacingSettings.svelte';
import TypstOutlineSettings from './TypstOutlineSettings.svelte';
import TypstSetRuleSettings from './TypstSetRuleSettings.svelte';

export function typstChipSettings(source: string): ChipSettings | null {
	if (readComment(source)?.marker === '//') return CommentSettings;
	if (readFootnote(source)) return TypstFootnoteSettings;
	if (readBreak(source)) return TypstBreakSettings;
	// a space by some other amount (a variable, a calculation) is drawn, and edited as its Typst
	if (readSpacing(source)?.length) return TypstSpacingSettings;
	if (readOutline(source)) return TypstOutlineSettings;
	if (readSetRule(source)) return TypstSetRuleSettings;
	return null;
}
