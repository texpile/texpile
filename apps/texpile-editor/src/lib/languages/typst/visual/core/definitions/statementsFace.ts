// a Typst chip of several statements drawn one statement at a time
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { childrenOf, hasSyntaxError } from '../../../knowledge/scan/syntax';
import { typstSyntax } from '../reading/typstCall';
import { definitionRow, type DefinitionRow } from './definitionRows';
import { typstDefinitionsFace } from './typstDefinitionsFace';
import type { TypstDrawer } from '../plugin/typstPlugin';

type Statement = { from: number; to: number; row: DefinitionRow | null; comment: boolean };

function statementsOf(source: string): Statement[] | null {
	const top = typstSyntax(source);
	if (hasSyntaxError(top)) return null;
	const out: Statement[] = [];
	const kids = childrenOf(top);
	for (let i = 0; i < kids.length; i++) {
		const node = kids[i];
		const last = out[out.length - 1];
		if (node.name === 'Space' || node.name === 'Parbreak') continue;
		if (node.name === 'LineComment' || node.name === 'BlockComment') {
			const sameLine = last && !source.slice(last.to, node.from).includes('\n');
			if (last && (sameLine || last.comment)) last.to = node.to;
			else out.push({ from: node.from, to: node.to, row: null, comment: true });
			continue;
		}
		const expression = kids[i + 1];
		if (node.name !== 'Hash' || !expression) return null;
		out.push({ from: node.from, to: expression.to, row: definitionRow(expression, source), comment: false });
		i++;
	}
	return out;
}

export function statementsFace(source: string, drawer: TypstDrawer): ChipFace | null {
	if (!/^\s*(#|\/\/|\/\*)/.test(source)) return null;
	const statements = statementsOf(source);
	if (!statements?.length || (statements.length === 1 && !statements[0].row)) return null;
	const parts: ChipFace[] = [];
	let run: Statement[] = [];
	function flush(): void {
		if (!run.length) return;
		parts.push(
			typstDefinitionsFace(
				run.map((s) => s.row!),
				source.slice(run[0].from, run[run.length - 1].to),
				drawer
			)
		);
		run = [];
	}
	for (const statement of statements) {
		if (statement.row) {
			run.push(statement);
			continue;
		}
		flush();
		const face = drawer.draw(source.slice(statement.from, statement.to));
		if (!face) {
			parts.forEach((part) => part.destroy?.());
			return null;
		}
		parts.push(face);
	}
	flush();
	return faceOfParts(parts, true);
}
