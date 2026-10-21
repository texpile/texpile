// the settings a LaTeX chip's panel shows, when the chip is one command they can hold exactly; else the panel is its LaTeX
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readComment } from '$lib/editor/visual/extensions/drawnChips/commentLines';
import CommentSettings from '$lib/editor/visual/extensions/drawnChips/CommentSettings.svelte';
import { ownMacroBody } from '../ownMacro/ownMacroFace.svelte';
import { macroCallName } from '../ownMacro/ownMacroCall';
import { readSpacing } from './spacingCommand';
import { readPageBreak } from './pageBreakCommand';
import { readCrossRef } from './crossRefCommand';
import { readHyperref } from './hyperrefCommand';
import { readBibliography } from './bibliographyCommand';
import { readFootnote } from './footnoteCommand';
import { readCharacter } from './characterCommand';
import { readTextStyle } from './textStyleCommand';
import AppendixSettings from './AppendixSettings.svelte';
import SpacingSettings from './SpacingSettings.svelte';
import PageBreakSettings from './PageBreakSettings.svelte';
import CrossRefSettings from './CrossRefSettings.svelte';
import HyperrefSettings from './HyperrefSettings.svelte';
import BibliographySettings from './BibliographySettings.svelte';
import FootnoteSettings from './FootnoteSettings.svelte';
import CharacterSettings from './CharacterSettings.svelte';
import TextStyleSettings from './TextStyleSettings.svelte';

const APPENDIX = /^\s*\\appendix\s*$/;

export function latexChipSettings(source: string): ChipSettings | null {
	// the paper's own definition wins, as it does in the drawing: the call is edited as LaTeX, its definition under it
	const call = macroCallName(source);
	if (call && ownMacroBody(call, source) !== null) return null;
	if (APPENDIX.test(source)) return AppendixSettings;
	if (readSpacing(source)) return SpacingSettings;
	if (readPageBreak(source)) return PageBreakSettings;
	if (readCrossRef(source)) return CrossRefSettings;
	if (readHyperref(source)) return HyperrefSettings;
	if (readBibliography(source)) return BibliographySettings;
	if (readFootnote(source)) return FootnoteSettings;
	if (readComment(source)?.marker === '%') return CommentSettings;
	if (readCharacter(source)) return CharacterSettings;
	if (readTextStyle(source)) return TextStyleSettings;
	return null;
}
