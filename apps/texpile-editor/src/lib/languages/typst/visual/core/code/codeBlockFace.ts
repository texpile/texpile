// `#{ a b }`, a code block of expressions drawn as what they print one after another, a set rule on its text or
// paragraphs as the setting line it is. A block with any other rule or a binding stays code
import type { SyntaxNode } from '@lezer/common';
import { faceOfParts, type ChipFace, type ChipFaceMaker } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { childrenOf, hasSyntaxError, textOf } from '../../../knowledge/scan/syntax';
import { typstSyntax } from '../reading/typstCall';
import { isStyleRule } from '../../convert/calls/styleRules';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon', 'Parbreak']);
const MOST_STATEMENTS = 12;

function statementsOf(source: string): SyntaxNode[] | null {
	const top = typstSyntax(source);
	if (hasSyntaxError(top)) return null;
	const kids = childrenOf(top).filter((k) => !QUIET.has(k.name));
	const block =
		kids.length === 2 && kids[0].name === 'Hash' && kids[1].name === 'CodeBlock' && kids[1].to === source.length ? kids[1] : null;
	const code = block?.getChild('Code');
	if (!code) return null;
	const statements = childrenOf(code).filter((k) => !QUIET.has(k.name));
	return statements.length > 0 && statements.length <= MOST_STATEMENTS ? statements : null;
}

// code that is a value of its own, never a rule, a binding or a loop
const EXPRESSIONS = new Set(['FuncCall', 'Ident', 'FieldAccess', 'ContentBlock', 'ModuleInclude', 'CodeBlock']);

export function codeBlockFace(source: string, drawChip: ChipFaceMaker): ChipFace | null {
	const written = source.trim();
	if (!written.startsWith('#{')) return null;
	const statements = statementsOf(written);
	if (
		!statements?.every((statement) => EXPRESSIONS.has(statement.name) || (statement.name === 'SetRule' && isStyleRule(statement, written)))
	)
		return null;
	const parts: ChipFace[] = [];
	for (const statement of statements) {
		const part = drawChip(`#${textOf(statement, written)}`);
		if (!part) {
			parts.forEach((drawn) => drawn.destroy?.());
			return null;
		}
		parts.push(part);
	}
	return faceOfParts(
		parts,
		parts.some((part) => part.line)
	);
}
