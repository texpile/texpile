import type { Plugin } from 'vite';

// V8 compiles a function at its first call, and a module's code cache holds only what compiled as it loaded. A chunk
// with this hint has every function compiled as it streams in, so the cache holds them all. Read from a file's first line
const HINT = '//# allFunctionsCalledOnLoad\n';

/** hints the chunks holding one of `modules`: the ones a launch runs most of */
export function eagerCompile(modules: string[]): Plugin {
	return {
		name: 'eager-compile',
		generateBundle: {
			// after Vite has put its preload list at the top of a chunk
			order: 'post',
			handler(_, bundle) {
				for (const chunk of Object.values(bundle)) {
					if (chunk.type !== 'chunk') continue;
					if (!chunk.moduleIds.some((id) => modules.some((m) => id.replace(/\\/g, '/').includes(m)))) continue;
					chunk.code = HINT + chunk.code;
					// a source map, when one is made, moves down by the line
					const map = bundle[`${chunk.fileName}.map`];
					if (map?.type === 'asset') {
						const read = JSON.parse(String(map.source)) as { mappings: string };
						map.source = JSON.stringify({ ...read, mappings: `;${read.mappings}` });
					}
				}
			}
		}
	};
}
