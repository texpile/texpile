/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// one completion per command or environment the loaded packages define
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { withAutoChain } from '../completion/shared';
import { fieldsOf, formatOf, insertedArgs, takesStar } from '../../knowledge/entryForms';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { stackedCommands, stackedEnvironments, type StackedCommand } from '../../knowledge/stackedEntries';

/** math: ranked first inside math and left out of text; text: ranked last inside math */
export type MacroCompletion = Completion & { math?: boolean; text?: boolean };
export type EnvironmentName = { name: string; detail?: string };

// inserts the form without [] arguments and shows the fullest one
function macroOf(label: string, e: StackedCommand): MacroCompletion {
	const inserted = insertedArgs(e.args ?? undefined);
	const detail = e.prints ?? (formatOf(e.args ?? undefined) || undefined);
	const info = e.doc ?? undefined;
	const base: Completion = inserted.length
		? snippetCompletion(label + fieldsOf(inserted), { label, type: 'function', detail, info })
		: { label, type: 'function', detail, info };
	const option: MacroCompletion = inserted.length ? withAutoChain(base) : base;
	if (e.in === 'math') option.math = true;
	if (e.in === 'text') option.text = true;
	return option;
}

export type PackageCompletions = { macros: MacroCompletion[]; envs: EnvironmentName[]; labels: Set<string>; envNames: Set<string> };

const merged = new WeakMap<LoadedFile[], PackageCompletions>();

/** what the packages define, a later package's definition winning a shared name */
export function packageCompletions(loaded: LoadedFile[]): PackageCompletions {
	let out = merged.get(loaded);
	if (!out) {
		const macros = new Map<string, MacroCompletion>();
		const envs = new Map<string, EnvironmentName>();
		const commands = stackedCommands(loaded);
		for (const [name, e] of commands) {
			if (!e.offered) continue;
			macros.set(`\\${name}`, macroOf(`\\${name}`, e));
			if (e.starred && !commands.has(`${name}*`))
				macros.set(`\\${name}*`, macroOf(`\\${name}*`, { ...e, args: takesStar(e.args ?? undefined) ? e.args!.slice(1) : e.args }));
		}
		for (const [name, e] of stackedEnvironments(loaded)) {
			if (!e.offered) continue;
			envs.set(name, { name, detail: formatOf(e.args ?? undefined) || undefined });
		}
		for (const file of loaded) for (const layer of file.layers) for (const name of layer.disables ?? []) macros.delete(`\\${name}`);
		out = { macros: [...macros.values()], envs: [...envs.values()], labels: new Set(macros.keys()), envNames: new Set(envs.keys()) };
		merged.set(loaded, out);
	}
	return out;
}
