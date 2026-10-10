// reads the literals of a LaTeX Suite snippet file; nothing in it is run

export class JsRegex {
	constructor(
		readonly source: string,
		readonly flags: string
	) {}
}

/** a function or any other expression; only its text is kept */
export class JsExpression {
	constructor(readonly text: string) {}
}

export type JsValue = string | number | boolean | null | JsRegex | JsExpression | JsValue[] | { [key: string]: JsValue };

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

class LiteralReader {
	pos = 0;
	constructor(readonly src: string) {}

	fail(what: string): never {
		const line = this.src.slice(0, this.pos).split('\n').length;
		throw new Error(`${what} on line ${line}`);
	}

	skipSpace(): void {
		while (this.pos < this.src.length) {
			const rest = this.src.slice(this.pos, this.pos + 2);
			if (/\s/.test(this.src[this.pos])) this.pos++;
			else if (rest === '//') this.pos = this.src.indexOf('\n', this.pos) < 0 ? this.src.length : this.src.indexOf('\n', this.pos);
			else if (rest === '/*') {
				const end = this.src.indexOf('*/', this.pos + 2);
				this.pos = end < 0 ? this.src.length : end + 2;
			} else return;
		}
	}

	readValue(): JsValue {
		this.skipSpace();
		const c = this.src[this.pos];
		if (c === '[') return this.readArray();
		if (c === '{') return this.readObject();
		if (c === '"' || c === "'" || c === '`') {
			const start = this.pos;
			const text = this.readString();
			// a template with ${...} in it is an expression
			return text === null ? this.readExpression(start) : text;
		}
		if (c === '/') return this.readRegex();
		const word = /^(-?\d+(\.\d+)?|true|false|null|undefined)(?![\w$])/.exec(this.src.slice(this.pos));
		if (word) {
			this.pos += word[0].length;
			if (word[0] === 'true' || word[0] === 'false') return word[0] === 'true';
			return word[0] === 'null' || word[0] === 'undefined' ? null : Number(word[0]);
		}
		return this.readExpression(this.pos);
	}

	readArray(): JsValue[] {
		const out: JsValue[] = [];
		this.pos++;
		for (;;) {
			this.skipSpace();
			if (this.src[this.pos] === ']') break;
			out.push(this.readValue());
			this.skipSpace();
			if (this.src[this.pos] === ',') this.pos++;
			else if (this.src[this.pos] !== ']') this.fail('expected , or ]');
		}
		this.pos++;
		return out;
	}

	readObject(): { [key: string]: JsValue } {
		const out: { [key: string]: JsValue } = {};
		this.pos++;
		for (;;) {
			this.skipSpace();
			if (this.src[this.pos] === '}') break;
			const key = this.readKey();
			this.skipSpace();
			if (this.src[this.pos] !== ':') this.fail('expected :');
			this.pos++;
			out[key] = this.readValue();
			this.skipSpace();
			if (this.src[this.pos] === ',') this.pos++;
			else if (this.src[this.pos] !== '}') this.fail('expected , or }');
		}
		this.pos++;
		return out;
	}

	readKey(): string {
		const c = this.src[this.pos];
		if (c === '"' || c === "'") return this.readString() ?? this.fail('expected a key');
		const name = /^[\w$]+/.exec(this.src.slice(this.pos));
		if (!name) this.fail('expected a key');
		this.pos += name[0].length;
		return name[0];
	}

	/** the string's text; null for a template that interpolates */
	readString(): string | null {
		const quote = this.src[this.pos++];
		let out = '';
		while (this.pos < this.src.length) {
			const c = this.src[this.pos++];
			if (c === quote) return out;
			if (quote === '`' && c === '$' && this.src[this.pos] === '{') return null;
			if (c !== '\\') {
				out += c;
				continue;
			}
			const e = this.src[this.pos++];
			const hex =
				e === 'u'
					? /^([0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})/.exec(this.src.slice(this.pos))
					: e === 'x'
						? /^[0-9a-fA-F]{2}/.exec(this.src.slice(this.pos))
						: null;
			if (hex) {
				out += String.fromCodePoint(parseInt(hex[0].replace(/[{}]/g, ''), 16));
				this.pos += hex[0].length;
			} else if (e === '\n') continue;
			else out += ESCAPES[e] ?? e;
		}
		return this.fail('unclosed string');
	}

	readRegex(): JsRegex {
		let i = this.pos + 1;
		let inClass = false;
		for (; i < this.src.length && this.src[i] !== '\n'; i++) {
			const c = this.src[i];
			if (c === '\\') i++;
			else if (c === '[') inClass = true;
			else if (c === ']') inClass = false;
			else if (c === '/' && !inClass) break;
		}
		if (this.src[i] !== '/') this.fail('unclosed regular expression');
		const source = this.src.slice(this.pos + 1, i);
		const flags = /^[a-z]*/.exec(this.src.slice(i + 1))![0];
		this.pos = i + 1 + flags.length;
		return new JsRegex(source, flags);
	}

	/** an arrow function or anything else: up to the , or bracket that ends it */
	readExpression(start: number): JsExpression {
		this.pos = start;
		const open: string[] = [];
		while (this.pos < this.src.length) {
			const c = this.src[this.pos];
			if (!open.length && (c === ',' || c === ']' || c === '}')) break;
			if (c === '"' || c === "'" || c === '`') {
				if (this.readString() === null) this.skipTemplate();
				continue;
			}
			if (CLOSERS[c]) open.push(CLOSERS[c]);
			else if (c === open[open.length - 1]) open.pop();
			this.pos++;
		}
		const text = this.src.slice(start, this.pos).trim();
		if (!text) this.fail('expected a value');
		return new JsExpression(text);
	}

	/** the rest of a template, from the { of its first ${ */
	skipTemplate(): void {
		this.pos++;
		let depth = 1;
		while (this.pos < this.src.length && depth > 0) {
			const c = this.src[this.pos++];
			if (c === '{') depth++;
			else if (c === '}') depth--;
		}
		while (this.pos < this.src.length && this.src[this.pos++] !== '`');
	}
}

/** the first array or object literal in a file, as data */
export function readJsLiteral(src: string): JsValue {
	const start = src.search(/[[{]/);
	if (start < 0) throw new Error('no array or object found');
	const reader = new LiteralReader(src);
	reader.pos = start;
	return reader.readValue();
}
