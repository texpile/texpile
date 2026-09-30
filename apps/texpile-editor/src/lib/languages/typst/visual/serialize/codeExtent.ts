// where a typst code expression ends once text follows it
import { TypstParser } from 'texpile-typst-syntax-wasm';
import { children, expressionEnd } from '../convert/inlineConvert';

let parser: TypstParser | null = null;

export function codeEndsBefore(code: string, rest: string): boolean {
	if (!parser) parser = new TypstParser();
	const kids = children(parser.parse(code + rest).topNode);
	if (kids[0]?.name !== 'Hash' || !kids[1]) return true;
	return kids[expressionEnd(kids, 1, code + rest)].to <= code.length;
}
