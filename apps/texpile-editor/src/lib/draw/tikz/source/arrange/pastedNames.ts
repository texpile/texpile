import { readPicture } from '../picture';
import { escapeRegExp } from '../sourceText';
import { namesGiven } from './statementNeeds';

function declaredNames(body: string) {
	const text = `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
	return new Set((readPicture(text, 0)?.statements ?? []).flatMap((st) => [...namesGiven(text, st)]));
}

function usedIn(source: string, name: string) {
	const n = escapeRegExp(name);
	return new RegExp(`\\(\\s*${n}\\s*[).]|\\bname\\s*=\\s*${n}\\b`).test(source);
}

export function renamePastedNames(picture: string, body: string) {
	let out = body;
	for (const name of declaredNames(body)) {
		if (!usedIn(picture, name)) continue;
		let k = 2;
		while (usedIn(picture, `${name}${k}`) || usedIn(body, `${name}${k}`)) k++;
		const n = escapeRegExp(name);
		out = out.replace(
			new RegExp(`(\\(\\s*)${n}(?=\\s*[).])|(\\bname\\s*=\\s*|\\bof\\s+)${n}\\b`, 'g'),
			(_, a, b) => `${a ?? b}${name}${k}`
		);
	}
	return out;
}
