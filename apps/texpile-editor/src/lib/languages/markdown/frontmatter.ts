// A Markdown file's metadata block: YAML between --- fences or TOML between +++ fences, at the very
// top. The visual editor keeps it verbatim as the file's preamble and the outline reads past it.

const EOL = '(?:\\r\\n|\\r|\\n)';
// closing fence kept in the preamble WITHOUT its trailing newline (mirrors \begin{document}), so
// the body's leading gap lands in the first block's `pre` and pristine saves stay byte-exact
const YAML = new RegExp(`^---[ \\t]*${EOL}(?:([\\s\\S]*?)${EOL})?(?:---|\\.\\.\\.)[ \\t]*(?=${EOL}|$)`);
const TOML = new RegExp(`^\\+\\+\\+[ \\t]*${EOL}(?:([\\s\\S]*?)${EOL})?\\+\\+\\+[ \\t]*(?=${EOL}|$)`);
// a `key:` (or `key =`) line is what tells metadata from a document that opens with a
// thematic break
const YAML_KEY = /^[ \t]*[^\s#-][^\r\n]*?:(?:[ \t\r]|$)/m;
const TOML_KEY = /^[ \t]*(?:[\w."'-]+[ \t]*=|\[)/m;

function isMetadata(inner: string | undefined, key: RegExp): boolean {
	return !inner || inner.trim() === '' || key.test(inner);
}

/** the length of the metadata block `text` opens with, 0 when it has none */
export function frontmatterLength(text: string): number {
	const yaml = YAML.exec(text);
	if (yaml) return isMetadata(yaml[1], YAML_KEY) ? yaml[0].length : 0;
	const toml = TOML.exec(text);
	if (toml) return isMetadata(toml[1], TOML_KEY) ? toml[0].length : 0;
	return 0;
}
