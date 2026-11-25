// the programs running from a folder Texpile is about to move, which Windows holds open while they run
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type RunningProgram = { pid: number; parent: number; name: string; exe: string | null };

const LIST_SCRIPT =
	'[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
	'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress';

type CimProcess = { ProcessId: number; ParentProcessId: number; Name: string; ExecutablePath: string | null };

export function parseProcessList(json: string): RunningProgram[] {
	const parsed = JSON.parse(json) as CimProcess | CimProcess[];
	return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
		pid: p.ProcessId,
		parent: p.ParentProcessId,
		name: p.Name,
		exe: p.ExecutablePath
	}));
}

async function listPrograms(): Promise<RunningProgram[]> {
	if (process.platform !== 'win32') return [];
	try {
		const { stdout } = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LIST_SCRIPT], {
			windowsHide: true,
			maxBuffer: 16 * 1024 * 1024
		});
		return parseProcessList(stdout);
	} catch {
		return [];
	}
}

function runsFrom(dir: string, exe: string | null): boolean {
	if (!exe) return false;
	const rel = path.win32.relative(dir.toLowerCase(), exe.toLowerCase());
	return !!rel && !rel.startsWith('..') && !path.win32.isAbsolute(rel);
}

/** the ones `ancestor` started, directly or through another */
export function startedFrom(all: RunningProgram[], dir: string, ancestor: number): RunningProgram[] {
	const children = new Map<number, number[]>();
	for (const p of all) if (p.pid !== p.parent) children.set(p.parent, [...(children.get(p.parent) ?? []), p.pid]);
	const ours = new Set<number>();
	const todo = [ancestor];
	while (todo.length) {
		for (const child of children.get(todo.pop()!) ?? []) {
			if (ours.has(child)) continue;
			ours.add(child);
			todo.push(child);
		}
	}
	return all.filter((p) => ours.has(p.pid) && runsFrom(dir, p.exe));
}

/** ends what Texpile started from `dir`: a compile in the terminal, a version probe, tlmgr. Windows only */
export async function stopProgramsStartedFrom(dir: string): Promise<void> {
	await Promise.all(
		startedFrom(await listPrograms(), dir, process.pid).map((p) =>
			execFileP('taskkill', ['/T', '/F', '/PID', String(p.pid)], { windowsHide: true }).catch(() => undefined)
		)
	);
}

/** the names of the programs still running from `dir`, each once. Windows only */
export async function programNamesFrom(dir: string): Promise<string[]> {
	return [...new Set((await listPrograms()).filter((p) => runsFrom(dir, p.exe)).map((p) => p.name))];
}
