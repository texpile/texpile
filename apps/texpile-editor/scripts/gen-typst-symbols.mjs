// Regenerates src/lib/languages/typst/symbols/typstSymbolTable.ts from Typst itself, through tinymist.
//
// Nothing here is typed in by hand. tinymist's symbol resource (`tinymist.getResources /symbols`,
// the one its own symbol view reads) gives every `sym` name, its character and its category. A probe
// document compiled by the same tinymist gives the rest: the `emoji` names, read off the module; the
// shorthands, found by asking Typst what each short run of punctuation evaluates to; and which names
// are deprecated, from the warnings compiling each of them raises. Unicode's own character names
// (UnicodeData.txt) are what the picker searches by meaning.
//
// Run it when tinymist moves to a new Typst. The output is committed: the picker works with no
// tinymist installed, for a guest in a shared session, and in the web build.
//
//   node scripts/gen-typst-symbols.mjs [path-to-tinymist] [UnicodeData.txt path or URL]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

const OUT = path.join(import.meta.dirname, '../src/lib/languages/typst/symbols/typstSymbolTable.ts');
const UNICODE_DATA = 'https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt';
// the characters Typst's shorthands are made of, per mode. `/` is left out of both (alone in math it
// is a fraction missing its halves), and `*`, `<` and `[` out of markup, where they open what they
// never close
const MATH_ALPHABET = "-<>=|~:!.*[]'+";
const MARKUP_ALPHABET = "->=|~:!.'+?";
// the longest, `<==>`, is four characters; searching five finds nothing more as of Typst 0.15 and
// keeps the language server busy for minutes
const LONGEST_SHORTHAND = 4;
const PROBE_LABEL = 'texpile-symbols';

const tinymist = process.argv[2] ?? 'tinymist';
const unicodeSource = process.argv[3] ?? UNICODE_DATA;

/** a JSON-RPC connection to `tinymist lsp` over stdio */
function startServer(bin) {
	const child = spawn(bin, ['lsp'], { stdio: ['pipe', 'pipe', 'ignore'] });
	const pending = new Map();
	const diagnostics = new Map();
	let buffer = Buffer.alloc(0);
	let nextId = 0;
	function send(message) {
		const body = JSON.stringify({ jsonrpc: '2.0', ...message });
		child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
	}
	child.stdout.on('data', (chunk) => {
		buffer = Buffer.concat([buffer, chunk]);
		for (;;) {
			const headerEnd = buffer.indexOf('\r\n\r\n');
			if (headerEnd < 0) return;
			const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())[1]);
			if (buffer.length < headerEnd + 4 + length) return;
			const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
			buffer = buffer.subarray(headerEnd + 4 + length);
			if (message.method === 'textDocument/publishDiagnostics') diagnostics.set(message.params.uri, message.params.diagnostics);
			// the server's own requests (configuration, capability registration) get an empty answer
			else if (message.method && message.id !== undefined) send({ id: message.id, result: null });
			else if (pending.has(message.id)) {
				pending.get(message.id)(message);
				pending.delete(message.id);
			}
		}
	});
	function request(method, params) {
		const id = ++nextId;
		return new Promise((resolve, reject) => {
			pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
			send({ id, method, params });
		});
	}
	return { request, notify: (method, params) => send({ method, params }), diagnostics, stop: () => child.kill() };
}

/** Typst source for a string literal; names and shorthand candidates are plain ASCII */
function typstString(s) {
	return `"${s.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * The probe: every emoji name with its character (a symbol's repr lists its variants, and eval
 * resolves each one), the shorthands (a candidate is one when it evaluates to a single symbol that
 * is not itself), and the `sym` names that math mode reads as something other than the symbol, which
 * would have to be written with their `sym.` prefix there.
 */
function probeSource(symNames) {
	return `#let variants(module, prefix) = dictionary(module).pairs().map(((base, value)) => {
  let shown = repr(value)
  let modifiers = shown.matches(regex("[\\\\s(]\\\\(\\"([^\\"]*)\\", \\"")).map(it => it.captures.first())
  let bare = if shown.starts-with(regex("symbol\\\\(\\\\s*\\"")) { (base,) } else { () }
  bare + modifiers.map(modifier => base + "." + modifier)
}).flatten().map(name => (prefix + "." + name, str(eval(prefix + "." + name))))

#let candidates(alphabet) = {
  let letters = alphabet.clusters()
  let all = letters
  let last = letters
  for _ in range(${LONGEST_SHORTHAND - 1}) {
    last = last.map(c => letters.map(l => c + l)).flatten()
    all += last
  }
  all
}

#let shorthands(alphabet, mode) = {
  let found = ()
  for candidate in candidates(alphabet) {
    let it = eval(candidate, mode: mode)
    if mode == "math" { it = it.body }
    if repr(it.func()) == "symbol" and it.text != candidate { found.push((candidate, it.text)) }
  }
  found
}

#let sym-names = (${symNames.map(typstString).join(', ')})
#let math-mismatches = sym-names.filter(name => {
  let it = eval(name.slice(4), mode: "math").body
  not (repr(it.func()) == "symbol" and it.text == str(eval(name)))
})

#metadata((
  emoji: variants(emoji, "emoji"),
  math: shorthands(${typstString(MATH_ALPHABET)}, "math"),
  markup: shorthands(${typstString(MARKUP_ALPHABET)}, "markup"),
  mathMismatches: math-mismatches,
)) <${PROBE_LABEL}>
`;
}

/** one name per line, so each deprecation warning points at the name that raised it */
function namesSource(names) {
	return `#let _ = (\n${names.map((name) => `  ${name},`).join('\n')}\n)\n`;
}

/** the deprecated names: tinymist warns on the line of each one. A Typst with none waits out the deadline */
async function deprecatedNames(server, dir, names) {
	const file = path.join(dir, 'names.typ');
	const text = namesSource(names);
	fs.writeFileSync(file, text);
	const uri = pathToFileURL(file).href;
	server.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'typst', version: 1, text } });
	const deadline = Date.now() + 20000;
	while (!server.diagnostics.get(uri)?.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
	const found = new Set();
	for (const d of server.diagnostics.get(uri) ?? []) {
		if (!/deprecated/.test(d.message)) continue;
		// line 0 is the opening `#let _ = (`
		const name = names[d.range.start.line - 1];
		if (name) found.add(name);
	}
	return found;
}

async function unicodeNames(source) {
	const text = /^https?:/.test(source) ? await (await fetch(source)).text() : fs.readFileSync(source, 'utf8');
	const names = new Map();
	for (const line of text.split('\n')) {
		const [code, name] = line.split(';');
		if (code && name && !name.startsWith('<')) names.set(parseInt(code, 16), name.toLowerCase());
	}
	return names;
}

// U+FE0E / U+FE0F only ask for text or emoji presentation; U+FE00 and friends pick another glyph
const PRESENTATION = /[︎️]/gu;

/** Unicode's name for a single character; a sequence (a flag, a family) has none of its own */
function unicodeNameOf(value, names) {
	const chars = [...value.replace(PRESENTATION, '')];
	return chars.length === 1 ? (names.get(chars[0].codePointAt(0)) ?? '') : '';
}

/** a TS string literal that shows every character that would otherwise be invisible or ambiguous in the file */
function tsString(s) {
	let out = "'";
	for (const ch of s) {
		const cp = ch.codePointAt(0);
		if (ch === "'" || ch === '\\') out += '\\' + ch;
		else if (/[\p{C}\p{Z}\p{M}︀-️]/u.test(ch) && ch !== ' ')
			out += cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`;
		else out += ch;
	}
	return out + "'";
}

/** each shorthand keyed by every name whose character it produces */
function shorthandsByName(pairs, rows) {
	const out = {};
	for (const [shorthand, ch] of pairs) {
		const target = ch.replace(PRESENTATION, '');
		const names = rows.filter((r) => r.name.startsWith('sym.') && r.value.replace(PRESENTATION, '') === target).map((r) => r.name);
		if (names.length === 0) console.warn(`shorthand ${shorthand} -> ${ch} names no symbol`);
		for (const name of names) out[name] ??= shorthand;
	}
	return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function typstVersion() {
	const text = execFileSync(tinymist, ['--version'], { encoding: 'utf8' });
	return /Typst Version:\s*(\S+)/.exec(text)?.[1] ?? 'unknown';
}

function emit({ version, categories, byCategory, math, markup }) {
	const record = (map) =>
		`{\n${Object.entries(map)
			.map(([k, v]) => `\t${tsString(k)}: ${tsString(v)}`)
			.join(',\n')}\n}`;
	const table = categories
		.map(
			(c) =>
				`\t${c}: [\n${byCategory[c].map((r) => `\t\t[${tsString(r.name)}, ${tsString(r.value)}, ${tsString(r.unicodeName)}]`).join(',\n')}\n\t]`
		)
		.join(',\n');
	return `// GENERATED by scripts/gen-typst-symbols.mjs - do not edit by hand.
//
// Every named symbol Typst has, read from Typst itself through tinymist: the \`sym\` names with the
// categories tinymist's symbol resource files them under, the \`emoji\` names, the shorthands Typst
// reads as a symbol, and Unicode's name for each character, which is what a search by meaning
// matches. Deprecated names are left out. Regenerate when tinymist moves to a new Typst.
//
// Source: Typst ${version}; the character names are Unicode's (Unicode Character Database,
// Unicode License V3, see UNICODE-LICENSE.txt beside this file)

/** the group a symbol is browsed under: tinymist's categories for \`sym\`, and one for \`emoji\` */
export type TypstSymbolCategory = ${categories.map((c) => `'${c}'`).join(' | ')};

/** the full name, the character it stands for, and Unicode's name for that character ('' for a sequence) */
export type TypstSymbolRow = readonly [name: string, value: string, unicodeName: string];

export const TYPST_SYMBOLS_VERSION = ${tsString(version)};

export const TYPST_SYMBOL_ROWS: Readonly<Record<TypstSymbolCategory, readonly TypstSymbolRow[]>> = {
${table}
};

/** what math mode reads as each symbol: \`->\` for \`arrow.r\` */
export const TYPST_MATH_SHORTHANDS: Readonly<Record<string, string>> = ${record(math)};

/** what markup reads as each symbol: \`--\` for \`dash.en\`, \`~\` for \`space.nobreak\` */
export const TYPST_MARKUP_SHORTHANDS: Readonly<Record<string, string>> = ${record(markup)};
`;
}

async function main() {
	const version = typstVersion();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typst-symbols-'));
	const server = startServer(tinymist);
	try {
		await server.request('initialize', { processId: process.pid, rootUri: pathToFileURL(dir).href, capabilities: {} });
		server.notify('initialized', {});

		const resource = await server.request('workspace/executeCommand', { command: 'tinymist.getResources', arguments: ['/symbols'] });
		const symRows = resource.symbols.map((s) => ({ name: s.id, value: s.value, category: s.category }));

		const probe = path.join(dir, 'probe.typ');
		fs.writeFileSync(probe, probeSource(symRows.map((r) => r.name)));
		const query = await server.request('workspace/executeCommand', {
			command: 'tinymist.exportQuery',
			arguments: [probe, { format: 'json', selector: `<${PROBE_LABEL}>`, field: 'value', one: true }, { write: false }]
		});
		const probed = JSON.parse(Buffer.from(query.data, 'base64').toString('utf8'));
		// the picker writes a bare name in math; a name math reads differently would need its prefix
		if (probed.mathMismatches.length) throw new Error(`math mode reads these differently: ${probed.mathMismatches.join(', ')}`);

		const emojiRows = probed.emoji.map(([name, value]) => ({ name, value, category: 'emoji' }));
		const deprecated = await deprecatedNames(
			server,
			dir,
			[...symRows, ...emojiRows].map((r) => r.name)
		);
		const names = await unicodeNames(unicodeSource);
		const rows = [...symRows, ...emojiRows]
			.filter((r) => !deprecated.has(r.name))
			.map((r) => ({ ...r, unicodeName: unicodeNameOf(r.value, names) }));

		const categories = [...new Set(rows.map((r) => r.category))];
		const byCategory = Object.fromEntries(categories.map((c) => [c, rows.filter((r) => r.category === c)]));
		const math = shorthandsByName(probed.math, rows);
		const markup = shorthandsByName(probed.markup, rows);

		const source = emit({ version, categories, byCategory, math, markup });
		const options = await prettier.resolveConfig(OUT);
		fs.writeFileSync(OUT, await prettier.format(source, { ...options, filepath: OUT }), 'utf8');
		console.log(
			`wrote ${path.relative(process.cwd(), OUT)}: Typst ${version}, ${rows.length} symbols in ${categories.length} categories ` +
				`(${deprecated.size} deprecated left out), ${Object.keys(math).length} math and ${Object.keys(markup).length} markup shorthand names`
		);
	} finally {
		server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

await main();
