// the commands that load a package, class or library, read from the file-command data
import { fileCallsIn } from '../../knowledge/calls/fileCommands';
import { commonCommand, commandNames, rolesOf, type CommandCall } from '../../knowledge/calls/commandCalls';
import { codeOnly } from '../../texCode';
import type { Argument } from '../../knowledge/types';

export type LoaderRole = 'package' | 'class' | 'library';

export type Loader = {
	command: string;
	role: LoaderRole;
	/** the argument that holds the names */
	arg: Argument;
	/** the arguments before the names */
	before: Argument[];
	/** an options bracket comes first */
	hasOptions: boolean;
	/** an optional argument of role date (the minimum release) follows the names */
	hasDate: boolean;
};

const ALL_ROLES: LoaderRole[] = ['package', 'class', 'library'];
const BEFORE_PATTERNS: Record<string, string> = { o: '(?:\\[[^\\]]*\\])?', s: '\\*?', m: '\\{[^{}]*\\}' };
const cache = new Map<string, Loader[]>();

function roleOf(arg: Argument, roles: readonly LoaderRole[]): LoaderRole | undefined {
	return roles.find((r) => rolesOf(arg).includes(r));
}

/** `naming` takes every argument that names one, loaded or not (\PassOptionsToPackage, both of \ReplacePackage) */
export function loadersOf(roles: readonly LoaderRole[] = ALL_ROLES, naming = false): Loader[] {
	const key = roles.join() + (naming ? '+naming' : '');
	let loaders = cache.get(key);
	if (!loaders) {
		loaders = commandNames(roles).flatMap((command) => {
			const args = commonCommand(command)?.args ?? [];
			const indexes = args.flatMap((a, i) => (roleOf(a, roles) && (naming || a.loads) ? [i] : []));
			return (naming ? indexes : indexes.slice(0, 1)).flatMap((index) => {
				const before = args.slice(0, index);
				if (before.some((a) => !(a.kind in BEFORE_PATTERNS))) return [];
				const arg = args[index];
				const hasOptions = index === 1 && args[0].kind === 'o' && rolesOf(args[0]).includes('options');
				return [
					{
						command,
						role: roleOf(arg, roles)!,
						arg,
						before,
						hasOptions,
						hasDate: !!args[index + 1] && rolesOf(args[index + 1]).includes('date')
					}
				];
			});
		});
		cache.set(key, loaders);
	}
	return loaders;
}

/** a regex source for the command and the arguments before its names; `open` lets the closing bracket of an option still be typed */
export function loaderOpening(loader: Loader, open = false): string {
	const patterns = loader.before.map((a) => (open && a.kind === 'o' ? '(?:\\[[^\\]{}]*\\]?)?' : BEFORE_PATTERNS[a.kind]));
	return `\\\\${loader.command}${patterns.join('')}`;
}

/** the id prefix a use of the argument's names carries: class-article, tikzlibrarycalc */
export function prefixOf(arg: Argument): string {
	if (rolesOf(arg).includes('class')) return 'class-';
	return arg.library ?? '';
}

/** the loader calls in `text` (comments masked by the caller), each with only its names argument */
export function loaderCalls(text: string, roles: readonly LoaderRole[] = ALL_ROLES): CommandCall[] {
	return fileCallsIn(text, roles).flatMap((call) => {
		const args = call.args.filter((a) => a.arg.loads && roleOf(a.arg, roles));
		return args.length ? [{ ...call, args }] : [];
	});
}

/** the text of the options bracket in front of the call's names */
export function optionsOf(text: string, call: CommandCall): string | undefined {
	const names = call.args[0];
	const previous = names.index > 0 ? commonCommand(call.command)?.args[names.index - 1] : undefined;
	if (!names.values[0] || !previous || previous.kind !== 'o' || !rolesOf(previous).includes('options')) return undefined;
	return /\[([^\]]*)\]/.exec(text.slice(call.at + 1 + call.command.length, names.values[0].at))?.[1];
}

/** true when `preamble` loads a class, so it starts a document of its own */
export function loadsClass(preamble: string): boolean {
	return loaderCalls(codeOnly(preamble), ['class']).length > 0;
}
