/* eslint no-param-reassign: "off" -- StreamLanguage hands each token a mutable state; mutating it is the API */
// enough of Typst's code to read a figure by: comments, strings, numbers with units, keywords and calls
import { StreamLanguage } from '@codemirror/language';

const KEYWORDS = /^(?:let|set|show|import|include|if|else|for|in|while|break|continue|return|and|or|not|as|none|auto|true|false)\b/;

type TypstState = { comment: boolean };

export const typstLanguage = StreamLanguage.define<TypstState>({
	name: 'typst',
	startState: () => ({ comment: false }),
	token(stream, state) {
		if (state.comment) {
			if (stream.skipTo('*/')) {
				stream.match('*/');
				state.comment = false;
			} else stream.skipToEnd();
			return 'comment';
		}
		if (stream.match('//')) {
			stream.skipToEnd();
			return 'comment';
		}
		if (stream.match('/*')) {
			state.comment = true;
			return 'comment';
		}
		if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
		if (stream.match(/^-?\d+(?:\.\d+)?(?:pt|mm|cm|in|em|deg|rad|%|fr)?/)) return 'number';
		if (stream.match(KEYWORDS)) return 'keyword';
		if (stream.match(/^#?[A-Za-z_][\w-]*(?=\s*\()/)) return 'variableName.function';
		if (stream.match(/^#[A-Za-z_][\w-]*/)) return 'variableName.special';
		if (stream.match(/^[A-Za-z_][\w-]*/)) return 'variableName';
		if (stream.match(/^[$[\]{}()]/)) return 'bracket';
		stream.next();
		return null;
	}
});
