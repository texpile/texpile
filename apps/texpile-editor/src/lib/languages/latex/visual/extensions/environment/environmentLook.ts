import type { EnvironmentHeads, TheoremStyle } from './environmentHeads';

export type EnvironmentLook =
	| { kind: 'theorem'; head: string; note: string | null; style: TheoremStyle }
	| { kind: 'proof'; head: string }
	| { kind: 'align'; align: 'center' | 'left' | 'right' }
	| { kind: 'box'; label: string };

const ALIGNED: Record<string, 'center' | 'left' | 'right'> = { center: 'center', flushleft: 'left', flushright: 'right' };

export function noteOf(args: string): string | null {
	const m = /^\s*\[([\s\S]*)\]\s*$/.exec(args);
	return m && !m[1].includes(']') ? m[1].trim() : null;
}

export function environmentLook(name: string, args: string, heads: EnvironmentHeads | undefined): EnvironmentLook {
	if (Object.hasOwn(ALIGNED, name) && !args.trim()) return { kind: 'align', align: ALIGNED[name] };
	const head = heads && Object.hasOwn(heads, name) ? heads[name] : null;
	const note = noteOf(args);
	// amsthm's proof takes its optional argument as the whole head: \begin{proof}[Proof of Lemma 2]
	if (/proof$/i.test(head?.wraps ?? name) && (head || note !== null)) return { kind: 'proof', head: note || head?.text || '' };
	if (head && (note !== null || !args.trim())) return { kind: 'theorem', head: head.text, note, style: head.style };
	return { kind: 'box', label: name };
}
