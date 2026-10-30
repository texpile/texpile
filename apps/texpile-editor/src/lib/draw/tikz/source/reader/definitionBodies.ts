import { commandAt, groupEnd, skipBlank } from './texScan';

const DEFINITION =
	/\\(?:[gex]?def|let|(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:re)?newenvironment|NewEnviron|RenewEnviron|(?:New|Renew|Provide|Declare)Document(?:Command|Environment))(?![A-Za-z@])/g;
// a definition's parts: a star, its name, its argument count and default, its bodies
const MOST_PARTS = 7;

/** the spans of every definition's braced parts, a macro's or an environment's body among them */
export function definitionBodies(source: string) {
	const bodies: [number, number][] = [];
	for (const m of source.matchAll(DEFINITION)) {
		let i = skipBlank(source, m.index + m[0].length);
		// `\def\name#1#2{...}`: the name, then its parameters up to the body
		if (/^\\[gex]?def$/.test(m[0])) {
			i += commandAt(source, i).length;
			const body = source.indexOf('{', i);
			if (body >= 0) bodies.push([body, groupEnd(source, body)]);
			continue;
		}
		for (let k = 0; k < MOST_PARTS; k++) {
			const c = source[i];
			if (c === '{' || c === '[') {
				const end = groupEnd(source, i);
				if (c === '{') bodies.push([i, end]);
				i = skipBlank(source, end);
			} else if (c === '*') i = skipBlank(source, i + 1);
			else if (c === '\\' && k < 2) i = skipBlank(source, i + commandAt(source, i).length);
			else break;
		}
	}
	return bodies;
}
