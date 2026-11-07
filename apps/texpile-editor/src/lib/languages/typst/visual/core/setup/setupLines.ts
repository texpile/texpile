// each setup statement in a few words: Package - fletcher 0.5.1, Align - left
import type { SyntaxNode } from '@lezer/common';
import type { SettingLine } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
import { m } from '$lib/paraglide/messages';
import { packageSpecOf } from '../../../knowledge';
import { readSetRule } from './setRuleCall';
import { setRuleSummary } from './setRuleSummary';
import type { SetupStatement } from './setupStatements';

const LONGEST_WORDS = 160;
const COMMENTS = new Set(['LineComment', 'BlockComment']);

function flattenToOneLine(source: string, from: number, to: number, node?: SyntaxNode): string {
	let out = '';
	let at = from;
	node?.cursor().iterate((n) => {
		if (!COMMENTS.has(n.name) || n.from < from || n.to > to) return;
		out += source.slice(at, n.from);
		at = n.to;
		return false;
	});
	out = (out + source.slice(at, to)).replace(/\s+/g, ' ').trim();
	return out.length > LONGEST_WORDS ? out.slice(0, LONGEST_WORDS) + '…' : out;
}

function nodeOnOneLine(node: SyntaxNode, source: string): string {
	return flattenToOneLine(source, node.from, node.to, node);
}

export function nameElement(name: string): string {
	const words = name.replace(/\./g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function describeSetRule(node: SyntaxNode, source: string): SettingLine {
	const condition = node.getChild('If');
	if (!condition) {
		const rule = readSetRule(`#${source.slice(node.from, node.to)}`);
		if (rule) {
			const [target, ...values] = setRuleSummary(rule);
			return { target, values };
		}
	}
	const target = node.getChild('Ident') ?? node.getChild('FieldAccess');
	const args = node.getChild('Args');
	const values = args ? [nodeOnOneLine(args, source).replace(/^\(|\)$/g, '')].filter(Boolean) : [];
	if (condition) values.push(flattenToOneLine(source, condition.from, node.to, node));
	return { target: target ? nameElement(source.slice(target.from, target.to)) : 'set', values };
}

export function describeSetupStatement(statement: SetupStatement, source: string): SettingLine {
	if (statement.kind === 'import') {
		const spec = packageSpecOf(statement.spec);
		return { target: m.drawn_chip_typst_package(), values: [spec ? `${spec.name} ${spec.version}` : statement.spec] };
	}
	if (statement.kind === 'set') return describeSetRule(statement.node, source);
	const { selector, transform } = statement;
	const target = selector ? m.drawn_chip_typst_show_selected({ selector: nodeOnOneLine(selector, source) }) : m.drawn_chip_typst_show();
	return { target, values: [nodeOnOneLine(transform, source)] };
}
