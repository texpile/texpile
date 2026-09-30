// a top-level set rule as its fields: each argument the panel knows, as the text its field shows, and written back by
// changing only that argument. A value a field cannot show as it is (a margin per side, a numbering function) shows as
// its Typst and is written back as typed
import { typStr } from '../../../serialize/typstInline';
import { unquote } from '../../../convert/inlineConvert';
import { blockMarkup, namedArg, readTypstCall, rewrittenCall, type CallArg, type TypstCall } from '../typstCall';
import { isTypstLength, typstLengthOf } from '../typstLength';
import { SET_FIELDS, isSetTarget, type SetField, type SetTarget } from './setRuleFields';

export type SetRule = { call: TypstCall; target: SetTarget; fields: readonly SetField[] };

/** `code` when the value is Typst the field cannot show as its kind; `given` when the rule sets it at all */
export type FieldValue = { text: string; code: boolean; given: boolean };

function setRuleOf(call: TypstCall | null): SetRule | null {
	if (!call || call.form !== 'set' || !isSetTarget(call.name)) return null;
	return { call, target: call.name, fields: SET_FIELDS[call.name] };
}

export function readSetRule(source: string): SetRule | null {
	return setRuleOf(readTypstCall(source));
}

function strings(arg: CallArg): string[] | null {
	if (arg.kind === 'Str') return [unquote(arg.value)];
	if (arg.kind !== 'Array') return null;
	const items: string[] = [];
	for (let c = arg.node.firstChild; c; c = c.nextSibling) {
		if (c.name === 'Str') items.push(unquote(arg.value.slice(c.from - arg.valueFrom, c.to - arg.valueFrom)));
		else if (!['LeftParen', 'RightParen', 'Comma', 'Space'].includes(c.name)) return null;
	}
	// the field's commas part the names
	return items.length && !items.some((item) => item.includes(',')) ? items : null;
}

function shown(arg: CallArg, field: SetField, source: string): string | null {
	switch (field.kind) {
		case 'string':
			return arg.kind === 'Str' ? unquote(arg.value) : null;
		case 'names':
			return strings(arg)?.join(', ') ?? null;
		case 'content':
			return arg.kind === 'Str' ? unquote(arg.value) : arg.kind === 'ContentBlock' ? blockMarkup(arg) : null;
		case 'length':
			return arg.kind === 'Auto' || typstLengthOf(arg.node, source) ? arg.value : null;
		case 'boolean':
			return arg.kind === 'Bool' ? arg.value : null;
		case 'integer':
			return arg.kind === 'Int' ? arg.value : null;
		case 'numbering':
			return arg.kind === 'None' ? '' : arg.kind === 'Str' ? unquote(arg.value) : null;
	}
}

export function fieldValue(rule: SetRule, field: SetField): FieldValue {
	const arg = namedArg(rule.call, field.name);
	if (!arg) return { text: '', code: false, given: false };
	const text = shown(arg, field, rule.call.source);
	return text === null ? { text: arg.value, code: true, given: true } : { text, code: false, given: true };
}

/** what the rule sets that no field shows, by name */
export function otherArguments(rule: SetRule): string[] {
	const known = new Set(rule.fields.map((field) => field.name));
	return rule.call.args.map((arg) => arg.name ?? arg.value).filter((name) => !known.has(name));
}

/** the Typst a field's typed text stands for; null when it is not a value of the field's kind yet */
function typed(field: SetField, text: string, current: CallArg | null): string | null {
	switch (field.kind) {
		case 'string':
		case 'numbering':
			return typStr(text);
		case 'names': {
			const names = text.split(',').map((name) => name.trim());
			if (current?.kind !== 'Array') return typStr(text.trim());
			// a list stays a list: the next name is still being typed after its comma
			if (names.some((name) => !name)) return null;
			return names.length === 1 ? `(${typStr(names[0])},)` : `(${names.map(typStr).join(', ')})`;
		}
		case 'content':
			return current?.kind === 'ContentBlock' ? `[${text}]` : typStr(text);
		case 'length':
			return text.trim() === 'auto' || isTypstLength(text) ? text.trim() : null;
		case 'boolean':
			return text === 'true' || text === 'false' ? text : null;
		case 'integer':
			return /^\s*\d+\s*$/.test(text) ? text.trim() : null;
	}
}

/** the field reads back what was typed: a list of names in however many spaces after its commas */
function readsBack(field: SetField, shownText: string, text: string): boolean {
	if (field.kind !== 'names') return shownText === text || shownText === text.trim();
	return shownText.replace(/\s*,\s*/g, ',') === text.trim().replace(/\s*,\s*/g, ',');
}

/**
 * the rule with one field's text written in; an emptied field takes its argument out, so Typst's default applies.
 * null while the text is not a value yet (a length half typed, a bracket not closed), and the rule is left as it is
 */
export function writeSetField(rule: SetRule, field: SetField, text: string): string | null {
	const current = namedArg(rule.call, field.name);
	const { code } = fieldValue(rule, field);
	const value = !text.trim() && field.kind !== 'boolean' ? null : code ? text : typed(field, text, current);
	if (value === null && text.trim()) return null;
	const written = rewrittenCall(rule.call, { named: { [field.name]: value } });
	const read = setRuleOf(readTypstCall(written));
	if (!read || read.target !== rule.target) return null;
	const after = fieldValue(read, field);
	return code || value === null || readsBack(field, after.text, text) ? written : null;
}
