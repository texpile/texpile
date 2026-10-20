// the calls that name files, and how TeX finds what they name
import { callsIn, rolesOf, type CallArgument, type CommandCall } from './commandCalls';
import { FILE_ROLES, type Argument, type FileRole } from '../types';

/** the names TeX looks for, in order, when the argument holds `written` */
export function namesTried(arg: Argument, written: string): string[] {
	if (!arg.ext) return [written];
	if (arg.appends === 'always') return [written + arg.ext];
	return /\.[A-Za-z0-9]+$/.test(written) ? [written, written + arg.ext] : [written + arg.ext, written];
}

/** every call in `text` of a command with an argument of one of `roles`, holding only those arguments and the folders
 * they sit under; comments are the caller's to mask */
export function fileCallsIn(text: string, roles: readonly FileRole[] = FILE_ROLES): CommandCall[] {
	return callsIn(text, roles).flatMap((call) => {
		const args = call.args.filter((a) => rolesOf(a.arg).some((r) => roles.includes(r as FileRole) || r === 'dir'));
		return args.length ? [{ ...call, args }] : [];
	});
}

/** the folders a text names for finding files (\graphicspath), in order; comments are the caller's to mask */
export function searchDirsIn(text: string): string[] {
	return fileCallsIn(text, ['dir']).flatMap((call) =>
		call.args.filter((a) => a.arg.list && rolesOf(a.arg).includes('dir')).flatMap((a) => a.values.map((v) => v.value))
	);
}

/** the folder a call's argument sits under (\import{dir}{file}), '' for none */
export function dirOf(call: CommandCall, arg: CallArgument): string {
	if (arg.arg.under === undefined) return '';
	return call.args.find((a) => a.index === arg.arg.under)?.values[0]?.value ?? '';
}
