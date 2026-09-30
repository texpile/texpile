// what the environment header may write: a name and arguments that still read back as this
// environment, never a call the next open would turn into a code chip or a broken file
import { typstToProseMirror } from '../../convert/converter';

/** whether `#name(args)[..]` reads back as an environment with exactly this name and arguments */
export function envHeadReadsBack(name: string, args: string | null): boolean {
	const head = `#${name}${args == null ? '' : `(${args})`}`;
	try {
		const first = typstToProseMirror(`${head}[x]\n`).doc.firstChild;
		return first?.type.name === 'typ_env' && first.attrs.name === name && first.attrs.args === args;
	} catch {
		return false;
	}
}

/** the arguments the field stands for: untouched it is what the call had, emptied it is no
 *  parentheses at all */
export function argsFromField(text: string, current: string | null): string | null {
	if (text === (current ?? '')) return current;
	return text.trim() === '' ? null : text;
}
