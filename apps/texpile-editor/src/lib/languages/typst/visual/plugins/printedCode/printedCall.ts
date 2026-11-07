// a chip that is one call printing the text it is given as code: `#raw("fn main() {}", lang: "rust")`
import { argumentText, blockLevelOf, printedText } from '$lib/languages/typst/knowledge';
import { namedArg, positionalArgs, readStdUse, type StdUse } from '$lib/languages/typst/visual/core/document';

/** the text a chip that is one call printing code gives, and whether it stands on lines of its own */
export function readPrinted(source: string): { use: StdUse; text: string; block: boolean } | null {
	const use = readStdUse(source);
	if (!use?.entry.mono) return null;
	const positional = positionalArgs(use.call);
	const text = printedText(use.entry, (param) => {
		const arg = param.positional ? positional[0] : namedArg(use.call, param.name);
		return arg ? argumentText(arg.node, use.call.source) : null;
	});
	const block = blockLevelOf(use.entry, (name) => namedArg(use.call, name)?.value ?? null) === true;
	return text?.trim() ? { use, text, block } : null;
}
