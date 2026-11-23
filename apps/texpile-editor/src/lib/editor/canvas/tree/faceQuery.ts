// the selector subset of face trees: type, #id, .class, [attr] with = ~= ^= $= *=, descendant and child, :not(), lists

/** the element surface a selector reads */
export type QueryElement = {
	readonly tagName: string;
	readonly parentNode: unknown;
	readonly children: readonly QueryElement[];
	getAttribute(name: string): string | null;
};

type AttributeTest = { name: string; op: '' | '=' | '~=' | '^=' | '$=' | '*='; value: string };
type CompoundSelector = { tag: string | null; ids: string[]; classes: string[]; attrs: AttributeTest[]; nots: ComplexSelector[][] };
/** right to left: the subject first; each step's combinator reaches the step after it */
type ComplexSelector = { compound: CompoundSelector; combinator: ' ' | '>' | null }[];

const parsed = new Map<string, ComplexSelector[]>();

class SelectorReader {
	at = 0;
	constructor(readonly text: string) {}

	fail(): never {
		throw new Error(`unsupported selector for a face tree: ${this.text}`);
	}

	spaces(): boolean {
		const start = this.at;
		while (/\s/.test(this.text[this.at] ?? '')) this.at++;
		return this.at > start;
	}

	name(): string {
		const match = /^-?[_a-zA-Z\u00a0-\uffff][-_a-zA-Z0-9\u00a0-\uffff]*|^\*/.exec(this.text.slice(this.at));
		if (!match) this.fail();
		this.at += match[0].length;
		return match[0];
	}

	value(): string {
		const quote = this.text[this.at];
		if (quote !== '"' && quote !== "'") return this.name();
		const end = this.text.indexOf(quote, this.at + 1);
		if (end < 0) this.fail();
		const value = this.text.slice(this.at + 1, end);
		this.at = end + 1;
		return value;
	}

	attribute(): AttributeTest {
		this.at++;
		this.spaces();
		const name = this.name();
		this.spaces();
		const op = /^[~^$*]?=/.exec(this.text.slice(this.at))?.[0] as AttributeTest['op'] | undefined;
		let value = '';
		if (op) {
			this.at += op.length;
			this.spaces();
			value = this.value();
			this.spaces();
		}
		if (this.text[this.at] !== ']') this.fail();
		this.at++;
		return { name, op: op ?? '', value };
	}

	compound(): CompoundSelector {
		const compound: CompoundSelector = { tag: null, ids: [], classes: [], attrs: [], nots: [] };
		const start = this.at;
		if (/[-_a-zA-Z*]/.test(this.text[this.at] ?? '')) {
			const tag = this.name();
			compound.tag = tag === '*' ? null : tag.toUpperCase();
		}
		for (;;) {
			const char = this.text[this.at];
			if (char === '.') {
				this.at++;
				compound.classes.push(this.name());
			} else if (char === '#') {
				this.at++;
				compound.ids.push(this.name());
			} else if (char === '[') compound.attrs.push(this.attribute());
			else if (this.text.startsWith(':not(', this.at)) {
				this.at += 5;
				compound.nots.push(this.list(')'));
				this.at++;
			} else break;
		}
		if (this.at === start) this.fail();
		return compound;
	}

	complex(): ComplexSelector {
		const compounds = [this.compound()];
		const combinators: (' ' | '>')[] = [];
		for (;;) {
			const spaced = this.spaces();
			const char = this.text[this.at];
			if (char === undefined || char === ',' || char === ')') break;
			if (char === '>') {
				this.at++;
				this.spaces();
				combinators.push('>');
			} else if (spaced) combinators.push(' ');
			else this.fail();
			compounds.push(this.compound());
		}
		return compounds.reverse().map((compound, i) => ({ compound, combinator: combinators[combinators.length - 1 - i] ?? null }));
	}

	list(close: ')' | ''): ComplexSelector[] {
		const selectors: ComplexSelector[] = [];
		for (;;) {
			this.spaces();
			selectors.push(this.complex());
			this.spaces();
			if (this.text[this.at] !== ',') break;
			this.at++;
		}
		if (close ? this.text[this.at] !== close : this.at < this.text.length) this.fail();
		return selectors;
	}
}

function parseSelector(selector: string): ComplexSelector[] {
	let list = parsed.get(selector);
	if (!list) {
		list = new SelectorReader(selector.trim()).list('');
		parsed.set(selector, list);
	}
	return list;
}

function attributeMatches(el: QueryElement, test: AttributeTest): boolean {
	const value = el.getAttribute(test.name);
	if (value === null) return false;
	switch (test.op) {
		case '':
			return true;
		case '=':
			return value === test.value;
		case '~=':
			return value.split(/\s+/).includes(test.value);
		case '^=':
			return test.value !== '' && value.startsWith(test.value);
		case '$=':
			return test.value !== '' && value.endsWith(test.value);
		case '*=':
			return test.value !== '' && value.includes(test.value);
	}
}

function compoundMatches(el: QueryElement, compound: CompoundSelector): boolean {
	if (compound.tag !== null && el.tagName.toUpperCase() !== compound.tag) return false;
	if (compound.ids.some((id) => el.getAttribute('id') !== id)) return false;
	if (compound.classes.length) {
		const classes = (el.getAttribute('class') ?? '').split(/\s+/);
		if (compound.classes.some((c) => !classes.includes(c))) return false;
	}
	if (compound.attrs.some((test) => !attributeMatches(el, test))) return false;
	return !compound.nots.some((list) => list.some((selector) => complexMatches(el, selector, 0)));
}

/** the walk stays inside the face tree: a face root's parent is the real view.dom */
function parentOf(el: QueryElement): QueryElement | null {
	const parent = el.parentNode;
	return typeof parent === 'object' && parent !== null && 'hole' in parent ? (parent as unknown as QueryElement) : null;
}

function complexMatches(el: QueryElement, selector: ComplexSelector, step: number): boolean {
	const { compound, combinator } = selector[step];
	if (!compoundMatches(el, compound)) return false;
	if (combinator === null) return true;
	if (combinator === '>') {
		const parent = parentOf(el);
		return parent !== null && complexMatches(parent, selector, step + 1);
	}
	for (let at = parentOf(el); at; at = parentOf(at)) if (complexMatches(at, selector, step + 1)) return true;
	return false;
}

export function matchesSelector(el: QueryElement, selector: string): boolean {
	return parseSelector(selector).some((complex) => complexMatches(el, complex, 0));
}

/** descendants in document order, the element itself excluded, as querySelectorAll */
export function selectAll(root: QueryElement, selector: string): QueryElement[] {
	const list = parseSelector(selector);
	const found: QueryElement[] = [];
	function walk(el: QueryElement): void {
		for (const child of el.children) {
			if (list.some((complex) => complexMatches(child, complex, 0))) found.push(child);
			walk(child);
		}
	}
	walk(root);
	return found;
}

export function selectFirst(root: QueryElement, selector: string): QueryElement | null {
	const list = parseSelector(selector);
	function walk(el: QueryElement): QueryElement | null {
		for (const child of el.children) {
			if (list.some((complex) => complexMatches(child, complex, 0))) return child;
			const inner = walk(child);
			if (inner) return inner;
		}
		return null;
	}
	return walk(root);
}

export function closestMatching(el: QueryElement, selector: string): QueryElement | null {
	for (let at: QueryElement | null = el; at; at = parentOf(at)) if (matchesSelector(at, selector)) return at;
	return null;
}
