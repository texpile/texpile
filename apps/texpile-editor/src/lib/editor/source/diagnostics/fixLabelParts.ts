/** the label around its code part, for setting that part in code */
export function fixLabelParts(label: string, code: string | undefined): { before: string; code: string; after: string } {
	const at = code ? label.indexOf(code) : -1;
	if (!code || at < 0) return { before: label, code: '', after: '' };
	return { before: label.slice(0, at), code, after: label.slice(at + code.length) };
}
