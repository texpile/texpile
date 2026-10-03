// Typst numbers equations by one rule for the whole document, #set math.equation(numbering: ..), not one equation at a
// time. The equation settings' switch writes that rule: into a math.equation rule already at the top level, or as a
// rule of its own after the set rules the document opens with. Off takes numbering out of every such rule, and a rule
// left setting nothing goes with it
import type { Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { namedArg, readTypstCall, rewrittenCall, type TypstCall } from './extensions/drawn/typstCall';

const NUMBERING = '"(1)"';
const RULE = `#set math.equation(numbering: ${NUMBERING})`;

type EquationRule = { pos: number; node: Node; call: TypstCall; end: string };

function equationRules(doc: Node): EquationRule[] {
	const rules: EquationRule[] = [];
	doc.forEach((node, pos) => {
		if (node.type.name !== 'raw_latex') return;
		// the semicolon ending a rule that shares its line (`#set ..; #set ..`) is no part of the call
		const text = node.textContent;
		const end = text.endsWith(';') ? ';' : '';
		const call = readTypstCall(text.slice(0, text.length - end.length));
		if (call?.form === 'set' && call.name === 'math.equation') rules.push({ pos, node, call, end });
	});
	return rules;
}

function numbers(call: TypstCall): boolean {
	const numbering = namedArg(call, 'numbering');
	return numbering !== null && numbering.kind !== 'None';
}

/** a rule in the document numbers its equations */
export function equationsNumbered(doc: Node): boolean {
	return equationRules(doc).some((rule) => numbers(rule.call));
}

/** the code the document opens with: the index after its last set rule or import, 0 when it opens with neither */
function afterOpeningRules(doc: Node): { index: number; afterRule: boolean } {
	let index = 0;
	let afterRule = false;
	for (let i = 0; i < doc.childCount && doc.child(i).type.name === 'raw_latex'; i++) {
		const text = doc.child(i).textContent;
		if (/^\s*#(set|import)\b/m.test(text)) {
			index = i + 1;
			afterRule = /^\s*#set\b/.test(text.split('\n').pop() ?? '');
		}
	}
	return { index, afterRule };
}

function withRule(state: EditorState): Transaction {
	const { doc, schema } = state;
	const { index, afterRule } = afterOpeningRules(doc);
	let pos = 0;
	for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
	// beside the rule before it, on the next line, as a document's opening rules stand
	const rule = schema.nodes.raw_latex.create({ typGap: afterRule ? 'newline' : null }, schema.text(RULE));
	return state.tr.insert(pos, rule);
}

/** the change numbering (or not) the document's equations; null when there is nothing to change */
export function equationNumberingChange(state: EditorState, numbered: boolean): Transaction | null {
	const rules = equationRules(state.doc);
	const tr = state.tr;
	const { schema } = state;
	if (numbered) {
		if (rules.some((rule) => numbers(rule.call))) return null;
		if (!rules.length) return withRule(state);
		// a rule the document has already (numbering: none, or a supplement of its own) takes the numbering
		const [rule] = rules;
		const text = rewrittenCall(rule.call, { named: { numbering: NUMBERING } });
		return tr.replaceWith(rule.pos + 1, rule.pos + rule.node.nodeSize - 1, schema.text(text + rule.end));
	}
	// the last first, so the ones before stay where they were
	for (const rule of [...rules].reverse()) {
		if (!namedArg(rule.call, 'numbering')) continue;
		if (rule.call.args.length === 1) tr.delete(rule.pos, rule.pos + rule.node.nodeSize);
		else
			tr.replaceWith(
				rule.pos + 1,
				rule.pos + rule.node.nodeSize - 1,
				schema.text(rewrittenCall(rule.call, { named: { numbering: null } }) + rule.end)
			);
	}
	return tr.docChanged ? tr : null;
}
