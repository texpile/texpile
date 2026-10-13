// the values of VS Code's snippet variables, after its snippetVariables.ts (MIT, see VENDORED-LICENSES.md)
export type SnippetEnvironment = { filePath: string | null; folder: string | null };

/** what only the editor knows at the cursor: TM_CURRENT_LINE, TM_CURRENT_WORD, TM_LINE_INDEX, ... */
export type CursorValues = Readonly<Record<string, string>>;

const environment = { read: (): SnippetEnvironment => ({ filePath: null, folder: null }) };

/** the app tells every editor which file and folder are open */
export function setSnippetEnvironment(read: () => SnippetEnvironment): void {
	environment.read = read;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CURSOR = ['TM_CURRENT_LINE', 'TM_CURRENT_WORD', 'TM_LINE_INDEX', 'TM_LINE_NUMBER', 'CURSOR_INDEX', 'CURSOR_NUMBER'];
const SELECTION = ['TM_SELECTED_TEXT', 'SELECTION'];
// no synchronous clipboard in the renderer, so it is always empty
const CLIPBOARD = ['CLIPBOARD'];

function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

function timeValues(date: Date): Record<string, string> {
	const offset = date.getTimezoneOffset();
	const hours = Math.trunc(Math.abs(offset) / 60);
	return {
		CURRENT_YEAR: String(date.getFullYear()),
		CURRENT_YEAR_SHORT: String(date.getFullYear()).slice(-2),
		CURRENT_MONTH: pad(date.getMonth() + 1),
		CURRENT_MONTH_NAME: MONTHS[date.getMonth()],
		CURRENT_MONTH_NAME_SHORT: MONTHS[date.getMonth()].slice(0, 3),
		CURRENT_DATE: pad(date.getDate()),
		CURRENT_DAY_NAME: DAYS[date.getDay()],
		CURRENT_DAY_NAME_SHORT: DAYS[date.getDay()].slice(0, 3),
		CURRENT_HOUR: pad(date.getHours()),
		CURRENT_MINUTE: pad(date.getMinutes()),
		CURRENT_SECOND: pad(date.getSeconds()),
		CURRENT_MILLISECOND: pad(date.getMilliseconds(), 3),
		CURRENT_SECONDS_UNIX: String(Math.floor(date.getTime() / 1000)),
		CURRENT_MILLISECONDS_UNIX: String(date.getTime()),
		CURRENT_TIMEZONE_OFFSET: `${offset > 0 ? '-' : '+'}${pad(hours)}:${pad(Math.abs(offset) - hours * 60)}`,
		CURRENT_TIMEZONE_NAME: Intl.DateTimeFormat().resolvedOptions().timeZone
	};
}

function randomValues(): Record<string, string> {
	return {
		RANDOM: Math.random().toString().slice(-6),
		RANDOM_HEX: Math.random().toString(16).slice(-6),
		UUID: crypto.randomUUID()
	};
}

function baseName(path: string): string {
	return path.split(/[\\/]/).pop() ?? '';
}

function directoryOf(path: string): string {
	return path.slice(0, Math.max(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))));
}

function commentValues(filePath: string): Record<string, string> {
	const extension = /\.([^.\\/]+)$/.exec(filePath)?.[1].toLowerCase();
	if (extension === 'typ') return { LINE_COMMENT: '//', BLOCK_COMMENT_START: '/*', BLOCK_COMMENT_END: '*/' };
	if (extension === 'md' || extension === 'markdown') return { BLOCK_COMMENT_START: '<!--', BLOCK_COMMENT_END: '-->' };
	return { LINE_COMMENT: '%' };
}

function fileValues({ filePath, folder }: SnippetEnvironment): Record<string, string> {
	const out: Record<string, string> = {};
	if (folder) Object.assign(out, { WORKSPACE_NAME: baseName(folder), WORKSPACE_FOLDER: folder });
	if (!filePath) return out;
	const name = baseName(filePath);
	const dot = name.lastIndexOf('.');
	const directory = directoryOf(filePath);
	const inFolder = folder && filePath.startsWith(folder) && /^[\\/]/.test(filePath.slice(folder.length));
	return Object.assign(out, commentValues(filePath), {
		TM_FILENAME: name,
		TM_FILENAME_BASE: dot > 0 ? name.slice(0, dot) : name,
		TM_DIRECTORY: directory,
		TM_DIRECTORY_BASE: baseName(directory),
		TM_FILEPATH: filePath,
		RELATIVE_FILEPATH: inFolder ? filePath.slice(folder.length + 1) : filePath
	});
}

const KNOWN = new Set([
	...CURSOR,
	...SELECTION,
	...CLIPBOARD,
	...Object.keys(timeValues(new Date(0))),
	...['RANDOM', 'RANDOM_HEX', 'UUID'],
	...Object.keys(fileValues({ filePath: 'a.typ', folder: 'b' }))
]);

/** VS Code turns any other $NAME into a place holding the name */
export function isKnownVariable(name: string): boolean {
	return KNOWN.has(name);
}

/** undefined: no value, so the default goes in */
export function variableValue(name: string, selection: string, cursor: CursorValues | undefined): string | undefined {
	if (SELECTION.includes(name)) return selection || undefined;
	if (CURSOR.includes(name)) return cursor?.[name];
	if (name.startsWith('CURRENT_')) return timeValues(new Date())[name];
	if (name.startsWith('RANDOM') || name === 'UUID') return randomValues()[name];
	if (!KNOWN.has(name) || CLIPBOARD.includes(name)) return undefined;
	return fileValues(environment.read())[name] || undefined;
}
