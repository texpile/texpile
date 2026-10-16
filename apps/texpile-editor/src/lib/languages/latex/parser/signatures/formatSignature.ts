// a package file's argument formats as the parser's signatures
const SIGNATURE_OF_GROUP: Record<string, string> = { '[]': 'o', '{}': 'm', '()': 'd()', '<>': 'd<>' };

/** a format such as `[]{}()` as the signature `o m d()`; null when it holds anything else */
export function signatureOfFormat(format: string): string | null {
	const groups = format.match(/\[\]|\{\}|\(\)|<>/g) ?? [];
	if (groups.join('') !== format.replace(/\s/g, '')) return null;
	return groups.map((g) => SIGNATURE_OF_GROUP[g]).join(' ');
}

/** each command's signature from its first entry, with `s` when a starred entry exists; a command without arguments
 * is left to the usage guess (\newblock{In}, \iint {\frac..}) */
export function signaturesOf(entries: { name: string; arg?: { format: string } }[]): Map<string, string> {
	const starred = new Set(entries.filter((e) => e.name.endsWith('*')).map((e) => e.name.slice(0, -1)));
	const signatures = new Map<string, string>();
	for (const e of entries) {
		const signature = e.arg ? signatureOfFormat(e.arg.format) : '';
		if (!signature || !/^[a-zA-Z]+$/.test(e.name) || signatures.has(e.name)) continue;
		signatures.set(e.name, starred.has(e.name) ? `s ${signature}` : signature);
	}
	return signatures;
}
