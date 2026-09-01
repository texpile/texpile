/* eslint no-param-reassign: "off" -- StreamLanguage hands each token a mutable state; mutating it is the API */
// hand-written bibtex StreamLanguage: neither @codemirror/language-data nor legacy-modes ships one.
// token() returns standard highlight-tag names, which StreamLanguage resolves via tags[name], so no tokenTable needed.
import { StreamLanguage, LanguageSupport } from '@codemirror/language';
import { bibCompletions } from './bibCompletion';

type BibState = {
	inEntry: boolean;
	/** what the next word means: the citekey, a field name, or a field value. */
	field: 'key' | 'name' | 'value' | null;
	braceDepth: number;
	inQuote: boolean;
};

export const bibtexLanguage = StreamLanguage.define<BibState>({
	name: 'bibtex',
	startState: () => ({ inEntry: false, field: null, braceDepth: 0, inQuote: false }),

	token(stream, state) {
		if (state.braceDepth > 0) {
			while (!stream.eol()) {
				const c = stream.next();
				if (c === '\\') {
					stream.next();
					continue;
				}
				if (c === '{') state.braceDepth++;
				else if (c === '}') {
					state.braceDepth--;
					if (state.braceDepth === 0) break;
				}
			}
			return 'string';
		}
		if (state.inQuote) {
			while (!stream.eol()) {
				const c = stream.next();
				if (c === '\\') {
					stream.next();
					continue;
				}
				if (c === '"') {
					state.inQuote = false;
					break;
				}
			}
			return 'string';
		}

		if (stream.eatSpace()) return null;

		// bibtex treats everything outside an entry as an implicit comment
		if (!state.inEntry) {
			if (stream.peek() === '@') {
				stream.next();
				stream.eatWhile(/[A-Za-z]/);
				state.inEntry = true;
				state.field = 'key';
				return 'keyword';
			}
			stream.skipToEnd();
			return 'comment';
		}

		const ch = stream.peek();
		if (state.field === 'value' && ch === '{') {
			stream.next();
			state.braceDepth = 1;
			return 'string';
		}
		if (state.field === 'value' && ch === '"') {
			stream.next();
			state.inQuote = true;
			return 'string';
		}
		if (ch === '{' || ch === '(') {
			stream.next();
			return null;
		}
		if (ch === '}' || ch === ')') {
			stream.next();
			state.inEntry = false;
			state.field = null;
			return null;
		}
		if (ch === ',') {
			stream.next();
			state.field = 'name';
			return null;
		}
		if (ch === '=') {
			stream.next();
			state.field = 'value';
			return 'operator';
		}
		if (ch === '#') {
			stream.next(); // bibtex string concatenation
			return 'operator';
		}

		if (state.field === 'key') {
			stream.eatWhile(/[^\s,{}()=]/);
			state.field = 'name';
			return 'labelName';
		}
		if (state.field === 'value') {
			if (stream.match(/^\d+/)) return 'number';
			if (stream.eatWhile(/[^\s,#}"]/)) return 'variableName'; // bare value or @string reference
			stream.next();
			return null;
		}
		// field name (author, title, year, ...)
		if (stream.match(/^[A-Za-z][\w:+.-]*/)) return 'typeName';
		stream.next();
		return null;
	}
});

export function bibtex(): LanguageSupport {
	// entry types and field names from biblatex's own data model, so what the editor offers is what
	// biber will take
	return new LanguageSupport(bibtexLanguage, [bibtexLanguage.data.of({ autocomplete: bibCompletions })]);
}
