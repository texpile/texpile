import type { BlockContext, Line } from '@lezer/markdown';

export function containerDepth(line: Line): number {
	return (line as unknown as { depth: number }).depth;
}

export function linesAfter(cx: BlockContext, line: Line): string[] {
	const input = (cx as unknown as { input: { length: number; read(from: number, to: number): string } }).input;
	const out: string[] = [];
	let at = cx.lineStart + line.text.length + 1;
	while (at < input.length) {
		const chunk = input.read(at, Math.min(input.length, at + 256));
		const nl = chunk.indexOf('\n');
		if (nl < 0 && at + chunk.length < input.length) {
			out.push(...input.read(at, input.length).split('\n'));
			break;
		}
		const text = nl < 0 ? chunk : chunk.slice(0, nl);
		out.push(text);
		if (/^[ \t>]*$/.test(text)) break;
		at += text.length + 1;
	}
	return out;
}
