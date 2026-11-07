import { selectsEncoding } from '$lib/languages/latex/knowledge/commands/fontEncodings';
import { HEAD } from '$lib/languages/latex/drawnCommands';
import { setsTitleBlock } from '$lib/languages/latex/titleParts';
import { holdsRunningText } from './textEnvironmentFace';
import { startsQuiet } from '../definitions/quietRun';
import { ownMacroDefinition } from '../own/ownMacroFace.svelte';
import { isTheoremCommand } from '../own/ownMathRun';
import { opensWithMath } from '../parts/mathPart';
import { takesPrintedText } from '../parts/printedArguments';
import { declaresSetting, printsNothing } from '../parts/plainCommands';
import { signatureOf } from '../reading/chipUnits';
import { startsPrimitive } from '../reading/primitiveUnits';
import { opensChip } from '../plugin/pluginMap';
import { documentTable } from '../title/documentTable.svelte';

export function worthParsing(source: string): boolean {
	if (opensWithMath(source) || /^\s*\{/.test(source)) return true;
	const env = /^\s*\\begin\s*\{([^}]*)\}/.exec(source);
	if (env) return declaresSetting(env[1]) || holdsRunningText(env[1]) || opensChip('environments', env[1]);
	const m = HEAD.exec(source);
	if (!m) return false;
	if (m[1]) return true;
	const name = /^\s$/.test(m[3]) ? ' ' : m[3];
	return (
		opensChip('commands', name) ||
		name === 'vskip' ||
		name === 'hskip' ||
		selectsEncoding(name) ||
		ownMacroDefinition(name) !== null ||
		startsQuiet(name) ||
		setsTitleBlock(documentTable.current, name) ||
		declaresSetting(name) ||
		printsNothing(name) ||
		startsPrimitive(name) ||
		takesPrintedText(name, signatureOf(name)) ||
		isTheoremCommand(name)
	);
}
