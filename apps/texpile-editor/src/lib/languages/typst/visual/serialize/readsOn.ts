// what goes on as more of a reference, a url or a code expression when it is written straight
// after one: the inline renderer escapes it, rewrites the marker into its call form, or keeps the two apart

/** a run as the inline renderer writes it: 'ref' an @target atom, 'other' an atom or chip */
type WrittenRun = { kind: string; content: string };

/** would this text extend a ref marker it follows? typst eats [A-Za-z0-9_:.-] after `@`,
 *  giving back only trailing `.`/`:` */
export function extendsRef(s: string): boolean {
	return /^[\p{L}\p{N}_-]/u.test(s) || /^[.:]+[\p{L}\p{N}_-]/u.test(s);
}

export function extendsUrl(s: string): boolean {
	const on = /^[0-9A-Za-z#$%&*+\-/=@_~[(]/;
	return on.test(s) || on.test(s.replace(/^[!,.:;?']+/, ''));
}

export function continuesCode(code: string, s: string): boolean {
	if (/^[([;]/.test(s) || /^\.[\p{L}_]/u.test(s)) return true;
	return /[\p{L}\p{N}_-]$/u.test(code) && /^[\p{L}\p{N}\p{M}_-]/u.test(s);
}

export function codeReadsOn(run: WrittenRun, s: string): boolean {
	return run.kind === 'other' && run.content.startsWith('#') && continuesCode(run.content, s);
}

/** would `s` written straight after `run` go on as more of it? a reference, a url and a code expression all read on */
export function readsOn(run: WrittenRun, s: string): boolean {
	if (run.kind === 'ref') return extendsRef(s);
	if (run.kind === 'other' && /^https?:\/\/\S+$/.test(run.content)) return extendsUrl(s);
	return codeReadsOn(run, s);
}
