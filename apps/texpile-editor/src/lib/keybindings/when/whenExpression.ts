// VS Code's when clauses, the part keybindings need: && || ! ( ) == != and bare keys
export type WhenExpression =
	| { kind: 'true' }
	| { kind: 'false' }
	| { kind: 'has'; key: string }
	| { kind: 'equals'; key: string; value: string; negated: boolean }
	| { kind: 'not'; expr: WhenExpression }
	| { kind: 'and'; exprs: WhenExpression[] }
	| { kind: 'or'; exprs: WhenExpression[] };

export type ContextValue = string | number | boolean | null | undefined;
export type ContextReader = (key: string) => ContextValue;

export class WhenSyntaxError extends Error {}

type Token = { kind: 'op'; text: string } | { kind: 'word'; text: string } | { kind: 'string'; text: string };

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	const pattern = /\s*(?:(&&|\|\||==|!=|!|\(|\))|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([\w.:\-/]+))/y;
	let at = 0;
	while (source.slice(at).trim()) {
		pattern.lastIndex = at;
		const m = pattern.exec(source);
		if (!m) throw new WhenSyntaxError(`Unexpected "${source.slice(at).trim()[0]}" at ${at + 1}`);
		at = pattern.lastIndex;
		if (m[1]) tokens.push({ kind: 'op', text: m[1] });
		else if (m[2] !== undefined || m[3] !== undefined) tokens.push({ kind: 'string', text: (m[2] ?? m[3]).replace(/\\(.)/g, '$1') });
		else tokens.push({ kind: 'word', text: m[4] });
	}
	return tokens;
}

/** throws WhenSyntaxError; an empty clause is always true */
export function parseWhen(source: string): WhenExpression {
	const tokens = tokenize(source);
	let i = 0;
	function peek(text: string): boolean {
		return tokens[i]?.kind === 'op' && tokens[i].text === text;
	}
	function fail(what: string): never {
		throw new WhenSyntaxError(tokens[i] ? `Unexpected "${tokens[i].text}"` : `Expected ${what}`);
	}
	function or(): WhenExpression {
		const exprs = [and()];
		while (peek('||')) {
			i++;
			exprs.push(and());
		}
		return exprs.length === 1 ? exprs[0] : { kind: 'or', exprs };
	}
	function and(): WhenExpression {
		const exprs = [unary()];
		while (peek('&&')) {
			i++;
			exprs.push(unary());
		}
		return exprs.length === 1 ? exprs[0] : { kind: 'and', exprs };
	}
	function unary(): WhenExpression {
		if (peek('!')) {
			i++;
			return { kind: 'not', expr: unary() };
		}
		if (peek('(')) {
			i++;
			const inner = or();
			if (!peek(')')) fail('")"');
			i++;
			return inner;
		}
		const token = tokens[i];
		if (token?.kind !== 'word') return fail('a context key');
		i++;
		if (token.text === 'true') return { kind: 'true' };
		if (token.text === 'false') return { kind: 'false' };
		if (peek('==') || peek('!=')) {
			const negated = tokens[i++].text === '!=';
			const value = tokens[i];
			if (!value || value.kind === 'op') return fail('a value');
			i++;
			return { kind: 'equals', key: token.text, value: value.text, negated };
		}
		return { kind: 'has', key: token.text };
	}
	if (!tokens.length) return { kind: 'true' };
	const expr = or();
	if (i < tokens.length) fail('the end');
	return expr;
}

export function evaluateWhen(expr: WhenExpression, read: ContextReader): boolean {
	switch (expr.kind) {
		case 'true':
			return true;
		case 'false':
			return false;
		case 'has':
			return !!read(expr.key);
		case 'equals': {
			const value = read(expr.key);
			return (value != null && String(value) === expr.value) !== expr.negated;
		}
		case 'not':
			return !evaluateWhen(expr.expr, read);
		case 'and':
			return expr.exprs.every((e) => evaluateWhen(e, read));
		case 'or':
			return expr.exprs.some((e) => evaluateWhen(e, read));
	}
}

function quoted(value: string): string {
	return /^[\w.:\-/]+$/.test(value) ? value : `'${value.replace(/['\\]/g, '\\$&')}'`;
}

/** the canonical text: what is written back and what removals compare */
export function printWhen(expr: WhenExpression, parent: 'and' | 'or' | 'not' | null = null): string {
	switch (expr.kind) {
		case 'true':
			return 'true';
		case 'false':
			return 'false';
		case 'has':
			return expr.key;
		case 'equals':
			return `${expr.key} ${expr.negated ? '!=' : '=='} ${quoted(expr.value)}`;
		case 'not': {
			const inner = printWhen(expr.expr, 'not');
			return expr.expr.kind === 'equals' ? `!(${inner})` : `!${inner}`;
		}
		case 'and': {
			const text = expr.exprs.map((e) => printWhen(e, 'and')).join(' && ');
			return parent === 'not' ? `(${text})` : text;
		}
		case 'or': {
			const text = expr.exprs.map((e) => printWhen(e, 'or')).join(' || ');
			return parent === 'and' || parent === 'not' ? `(${text})` : text;
		}
	}
}

/** the context keys a clause reads */
export function whenKeys(expr: WhenExpression, into = new Set<string>()): Set<string> {
	if (expr.kind === 'has' || expr.kind === 'equals') into.add(expr.key);
	else if (expr.kind === 'not') whenKeys(expr.expr, into);
	else if (expr.kind === 'and' || expr.kind === 'or') for (const e of expr.exprs) whenKeys(e, into);
	return into;
}
