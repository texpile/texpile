// which commands set the title block, read from the argument parts of the files a document loads
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

// the kernel commands for the block itself, which the package data gives no part
export const PRINT_BLOCK = 'maketitle';
export const BLOCK_NOTE = 'thanks';

export function titlePartOf(arg: Argument | undefined): TitlePart | null {
	return arg?.part && TITLE_PARTS.has(arg.part) ? (arg.part as TitlePart) : null;
}

export function signatureIn(table: PackageTable, name: string): readonly Argument[] | undefined {
	return Object.hasOwn(table.macros, name) ? table.macros[name] : undefined;
}

/** whether a file the document loads gives `name` an argument that is part of the title block */
export function setsTitleBlock(table: PackageTable, name: string): boolean {
	return name === PRINT_BLOCK || name === BLOCK_NOTE || !!signatureIn(table, name)?.some((arg) => titlePartOf(arg) !== null);
}

/** starts with a command of the title block: one the editor draws, which never merges with the code beside it */
export function startsTitleBlock(source: string, table: PackageTable): boolean {
	const name = HEAD.exec(source)?.[3];
	return !!name && setsTitleBlock(table, name);
}
