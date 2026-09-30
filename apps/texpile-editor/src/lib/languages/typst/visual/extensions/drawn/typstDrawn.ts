// the Typst calls the editor draws: the converter keeps each a chip of its own, never merged with the code beside it
import { readFootnote } from './footnoteCall';
import { readBreak } from './breakCall';
import { readSpacing } from './spacingCall';
import { readOutline } from './outlineCall';
import { readSetRule } from './setRule/setRuleCall';

export function typstDrawnCommand(source: string): boolean {
	return (
		readFootnote(source) !== null ||
		readBreak(source) !== null ||
		readSpacing(source) !== null ||
		readOutline(source) !== null ||
		readSetRule(source) !== null
	);
}
