// a chip that sets the document up, drawn quiet as LaTeX draws its preamble's settings
import { sourceHint, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { settingsFace } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
import { typstScopeNow } from '../scope/fileScopeNow.svelte';
import { faceFollowingScope } from '../scope/scopeFollowingFace';
import { describeSetupStatement } from './setupLines';
import { readSetup, type SetupStatement } from './setupStatements';
import { readTemplateCall } from './templateCall';
import { titleBlockFace } from './titleBlockFace';

function drawSettings(statements: SetupStatement[], source: string, hint: string): ChipFace {
	return settingsFace(
		statements.map((statement) => describeSetupStatement(statement, source)),
		hint
	);
}

function templateFace(show: Extract<SetupStatement, { kind: 'show' }>, source: string, hint: string): ChipFace {
	function draw(): ChipFace {
		const scope = typstScopeNow.current;
		const template = readTemplateCall(show.transform, source, scope);
		return (template && titleBlockFace(template, source, scope, hint)) ?? drawSettings([show], source, hint);
	}
	return faceFollowingScope(draw(), draw, () => true);
}

export function setupFace(source: string): ChipFace | null {
	const statements = readSetup(source);
	if (!statements) return null;
	const hint = sourceHint(source);
	const [only] = statements;
	if (statements.length === 1 && only.kind === 'show' && !only.selector) return templateFace(only, source, hint);
	return drawSettings(statements, source, hint);
}
