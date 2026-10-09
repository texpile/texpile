// the CSpell dictionaries as CSpell's binary trie, gzipped, under spell/ beside the bundle. Each is built once per
// package version into node_modules/.cache; the dev server builds one on its first request
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Plugin } from 'vite';
import {
	DICTIONARY_DIR,
	DICTIONARY_LANGUAGES,
	DICTIONARY_PACKAGES,
	isDictionaryLanguage,
	type DictionaryLanguage,
	type DictionaryOptions
} from '../src/lib/editor/spellcheck/languages/spellLanguages';

type BuiltDictionary = { trie: Buffer; options: DictionaryOptions; license: string };

type CspellExtension = {
	dictionaryDefinitions: { path: string; repMap?: [string, string][]; dictionaryInformation?: Record<string, unknown> }[];
	languageSettings?: { caseSensitive?: boolean }[];
};

type TrieLib = {
	decodeTrie(data: Uint8Array): { words(): Iterable<string> };
	encodeITrieToBTrie(trie: unknown, options: { optimize?: boolean; useStringTable?: boolean }): Uint8Array<ArrayBuffer>;
};

/** some packages put // comments on their own lines */
function readJsonc(file: string): unknown {
	return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
}

function versionAt(dir: string): string {
	return (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}

async function buildDictionary(appDir: string, id: DictionaryLanguage): Promise<BuiltDictionary> {
	const pkgDir = path.join(appDir, 'node_modules', DICTIONARY_PACKAGES[id]);
	const ext = readJsonc(path.join(pkgDir, 'cspell-ext.json')) as CspellExtension;
	const def = ext.dictionaryDefinitions[0];
	const options: DictionaryOptions = {
		caseSensitive: ext.languageSettings?.[0]?.caseSensitive ?? false,
		...(def.repMap ? { repMap: def.repMap } : {}),
		...(def.dictionaryInformation ? { dictionaryInformation: def.dictionaryInformation } : {})
	};
	const license = ['LICENSE', 'COPYING']
		.map((name) => path.join(pkgDir, name))
		.filter((file) => fs.existsSync(file))
		.map((file) => fs.readFileSync(file, 'utf8'))
		.join('\n\n');

	const cacheDir = path.join(appDir, 'node_modules/.cache/texpile-spell');
	const cached = path.join(cacheDir, `${id}-${versionAt(pkgDir)}-${versionAt(path.join(appDir, 'node_modules/cspell-trie-lib'))}.trie.gz`);
	if (fs.existsSync(cached)) return { trie: fs.readFileSync(cached), options, license };

	const trieLib = (await import('cspell-trie-lib')) as TrieLib;
	const { createSpellingDictionaryFromTrieFile } = await import('cspell-dictionary');
	const published = fs.readFileSync(path.join(pkgDir, def.path));
	const data = new Uint8Array(def.path.endsWith('.gz') ? zlib.gunzipSync(published) : published);
	// not useStringTable: in cspell-trie-lib 10.3 it drops words (Prüfung, Schüler and 1.4% more of German)
	const binary = trieLib.encodeITrieToBTrie(trieLib.decodeTrie(data), { optimize: true });
	// checked as the app asks, word by word through a dictionary
	const before = createSpellingDictionaryFromTrieFile(data, id, 'published', {});
	const after = createSpellingDictionaryFromTrieFile(binary, id, 'built', {});
	let sampled = 0;
	const lost: string[] = [];
	for (const entry of trieLib.decodeTrie(data).words()) {
		const word = entry.replace(/^[+~!]+|\+$/g, '');
		if (sampled++ % 23 === 0 && before.has(word) && !after.has(word)) lost.push(word);
	}
	if (lost.length)
		throw new Error(`spell dictionary ${id}: the binary trie lost ${lost.length} words, such as ${lost.slice(0, 5).join(', ')}`);

	const trie = zlib.gzipSync(binary, { level: 9 });
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(cached, trie);
	return { trie, options, license };
}

export function spellDictionaries(appDir: string): Plugin {
	const builds = new Map<DictionaryLanguage, Promise<BuiltDictionary>>();
	function dictionary(id: DictionaryLanguage): Promise<BuiltDictionary> {
		let built = builds.get(id);
		if (!built) builds.set(id, (built = buildDictionary(appDir, id)));
		return built;
	}
	return {
		name: 'spell-dictionaries',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const asked = new RegExp(`^/${DICTIONARY_DIR}/([\\w-]+)\\.(trie\\.gz|json)$`).exec(req.url?.split('?')[0] ?? '');
				if (!asked || !isDictionaryLanguage(asked[1])) return next();
				const json = asked[2] === 'json';
				dictionary(asked[1]).then(
					(built) => {
						res.setHeader('Content-Type', json ? 'application/json' : 'application/octet-stream');
						res.end(json ? JSON.stringify(built.options) : built.trie);
					},
					(error: unknown) => next(error)
				);
			});
		},
		async generateBundle() {
			for (const id of DICTIONARY_LANGUAGES) {
				const built = await dictionary(id);
				this.emitFile({ type: 'asset', fileName: `${DICTIONARY_DIR}/${id}.trie.gz`, source: built.trie });
				this.emitFile({ type: 'asset', fileName: `${DICTIONARY_DIR}/${id}.json`, source: JSON.stringify(built.options) });
				this.emitFile({ type: 'asset', fileName: `${DICTIONARY_DIR}/${id}.LICENSE.txt`, source: built.license });
			}
		}
	};
}
