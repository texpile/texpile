// which install compiles each format: the one whose bin folder the Folders list holds first, else PATH's
import { toolchainProbe } from './toolchainProbe.svelte';
import { folderKey, toolDirs, type ToolDirRow } from './toolDirs.svelte';

type Family = ToolDistro['family'];

/** the folder list with `chosen` in front and every other install's folder dropped */
export function withDistribution(rows: ToolDirRow[], isDistro: (row: ToolDirRow) => boolean, chosen: string | null): string[] {
	const rest = rows.filter((r) => !isDistro(r)).map((r) => r.entry);
	return chosen === null ? rest : [chosen, ...rest];
}

class Distros {
	list(family: Family): ToolDistro[] {
		return toolchainProbe.distros.filter((d) => d.family === family);
	}

	/** per kind: one folder can hold TeX and tinymist both */
	forRow(family: Family, row: ToolDirRow): ToolDistro | undefined {
		const keys = [folderKey(row.absolute), folderKey(row.real)];
		return this.list(family).find((d) => [d.dir, ...d.dirs].some((a) => keys.includes(folderKey(a))));
	}

	namesFor(row: ToolDirRow): string {
		return (['latex', 'typst'] as Family[])
			.map((f) => this.forRow(f, row)?.name)
			.filter((n): n is string => !!n)
			.join(', ');
	}

	/** null means whatever PATH gives */
	active(family: Family): ToolDistro | null {
		for (const row of toolDirs.rows) {
			const d = this.forRow(family, row);
			if (d) return d;
		}
		return null;
	}

	onPath(family: Family): ToolDistro | null {
		return this.list(family).find((d) => d.onPath) ?? null;
	}

	/** Texpile's own copy is installed and another one is in use */
	managedNotInUse(family: Family): boolean {
		const managed = this.list(family).find((d) => d.managed);
		if (!managed) return false;
		return (this.active(family) ?? this.onPath(family) ?? managed).dir !== managed.dir;
	}

	async choose(family: Family, dir: string | null): Promise<void> {
		const entry = dir === null ? null : await toolDirs.spelling(dir);
		// a folder that also holds the other kind stays, or it would unpick that one too
		const others = (['latex', 'typst'] as Family[]).filter((f) => f !== family);
		const mine = (r: ToolDirRow) => !!this.forRow(family, r) && !others.some((f) => this.forRow(f, r));
		await toolDirs.write(withDistribution(toolDirs.rows, mine, entry));
	}
}

export const distros = new Distros();
