import type { Argument, TitlePart } from './knowledge/types';
import type { PackageTable } from './parser/signatures/packageTable';
import { HEAD } from './drawnCommands';

const TITLE_PARTS: ReadonlySet<string> = new Set<TitlePart>([
	'title',
	'author',
	'affiliation',
	'email',
	'date',
	'keywords',
	'classification',
	'running',
	'mark',
	'note'
]);

export const PRINT_BLOCK = 'maketitle';
export const BLOCK_NOTE = 'thanks';

export function titlePartOf(arg: Argument | undefined): TitlePart | null {
	return arg?.part && TITLE_PARTS.has(arg.part) ? (arg.part as TitlePart) : null;
}

export function signatureIn(table: PackageTable, name: string): readonly Argument[] | undefined {
	return Object.hasOwn(table.macros, name) ? table.macros[name] : undefined;
}

export function setsTitleBlock(table: PackageTable, name: string): boolean {
	return name === PRINT_BLOCK || name === BLOCK_NOTE || !!signatureIn(table, name)?.some((arg) => titlePartOf(arg) !== null);
}

export function startsTitleBlock(source: string, table: PackageTable): boolean {
	const name = HEAD.exec(source)?.[3];
	return !!name && setsTitleBlock(table, name);
}
