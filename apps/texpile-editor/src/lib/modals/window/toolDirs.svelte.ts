// the folders searched before PATH, as the Toolchain tab edits them
import { settings, updateSettingsSettled } from '$lib/settings';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { toolchainProbe } from './toolchainProbe.svelte';
import { m } from '$lib/paraglide/messages';

export type ToolDirRow = {
	/** what settings.json holds, as typed */
	entry: string;
	absolute: string;
	/** the folder behind any symlink, how distros reports an install */
	real: string;
	exists: boolean;
};

function folderOf(file: string): string {
	return file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')));
}

export function folderKey(p: string): string {
	return p.replace(/[\\/]+$/, '').toLowerCase();
}

async function forms(entry: string): Promise<{ absolute: string; relative: string | null; exists: boolean; real: string }> {
	const bridge = window.texpileTypst;
	return bridge?.dirForms ? bridge.dirForms(entry) : { absolute: entry, relative: null, exists: true, real: entry };
}

class ToolDirs {
	rows = $state<ToolDirRow[]>([]);
	draft = $state('');
	busy = $state(false);

	async refresh(): Promise<void> {
		const rows: ToolDirRow[] = [];
		for (const entry of settings.current.toolDirs) {
			const { absolute, exists, real } = await forms(entry);
			rows.push({ entry, absolute, real, exists });
		}
		this.rows = rows;
	}

	async browse(): Promise<void> {
		const dir = await nativeBridge()?.pickFolder?.(m.prefs_toolchain_dirs_add_title());
		if (dir) await this.suggest(dir);
	}

	async locate(tool: string): Promise<void> {
		const file = await nativeBridge()?.pickFile?.(m.prefs_toolchain_locate_title({ name: tool }));
		if (file) await this.suggest(folderOf(file));
	}

	private async suggest(dir: string): Promise<void> {
		this.draft = await this.spelling(dir);
	}

	/** how a folder is written down: relative to a portable app on its own drive, else absolute */
	async spelling(dir: string): Promise<string> {
		const f = await forms(dir);
		return f.relative ?? f.absolute;
	}

	async add(): Promise<void> {
		const entry = this.draft.trim();
		if (!entry) return;
		const f = await forms(entry);
		if (this.rows.some((r) => folderKey(r.real) === folderKey(f.real))) return;
		this.draft = '';
		await this.write([...settings.current.toolDirs, entry]);
	}

	async remove(entry: string): Promise<void> {
		await this.write(settings.current.toolDirs.filter((d) => d !== entry));
	}

	/** every entry that names `dir`, gone from the list */
	async forget(dir: string): Promise<void> {
		await this.refresh();
		const gone = this.rows.filter((r) => [r.absolute, r.real].some((p) => folderKey(p) === folderKey(dir))).map((r) => r.entry);
		if (gone.length) await this.write(settings.current.toolDirs.filter((d) => !gone.includes(d)));
	}

	async write(toolDirs: string[]): Promise<void> {
		this.busy = true;
		try {
			await updateSettingsSettled({ toolDirs });
			await this.refresh();
		} finally {
			this.busy = false;
		}
		void toolchainProbe.run();
	}
}

export const toolDirs = new ToolDirs();
