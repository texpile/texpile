// which install compiles each format: the one whose bin folder the Folders list holds first, else PATH's
import { toolchainProbe } from './toolchainProbe.svelte';
import { folderKey, folderOf, toolDirs, type ToolDirRow } from './toolDirs.svelte';
import { folderFor } from './toolchain/toolchainRows';

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

	/** what a listed folder holds: the installs found there, else the programs */
	namesFor(row: ToolDirRow): string {
		const installs = (['latex', 'typst'] as Family[]).map((f) => this.forRow(f, row)?.name).filter((n): n is string => !!n);
		if (installs.length) return installs.join(', ');
		const keys = [folderKey(row.absolute), folderKey(row.real)];
		return toolchainProbe.probes
			.filter((p) => p.path && keys.includes(folderKey(folderOf(p.path))))
			.map((p) => p.id)
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

	/** after Texpile installs its own copy from the picker: that copy is the one picked */
	async useManaged(family: Family): Promise<void> {
		await toolchainProbe.run();
		const list = this.list(family);
		const managed = list.find((d) => d.managed);
		if (managed) await this.choose(family, folderFor(list, managed.dir));
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
