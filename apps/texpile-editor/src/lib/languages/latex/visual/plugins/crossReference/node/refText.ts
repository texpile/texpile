/**
 * What the compiler will print for a reference, as far as the editor can know it.
 *
 * The COMMAND decides, not the target. \ref prints a bare number whatever it points at, so the
 * chip prints a bare number too: the word in "Table~\ref{tab:x}" is the author's, and adding our
 * own guess on top of it is how that read "Table Table 2". \eqref is amsmath's and supplies its
 * own parentheses. The commands that generate a word themselves - \autoref, \cref - never reach
 * here; they stay raw, because that word comes from the preamble.
 */
export function refText(command: string, number: number | string): string {
	return command === 'eqref' ? `(${number})` : String(number);
}
