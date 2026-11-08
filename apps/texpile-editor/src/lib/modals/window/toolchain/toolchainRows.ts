// what Preferences › Toolchain lists for a language: the picker's installs and the programs that need a row of their own
import { Download, ExternalLink } from '@lucide/svelte';
import type { DropdownGroup } from '$lib/menus/MenuDropdown.svelte';
// eslint-disable-next-line no-restricted-imports -- a type, erased from the bundle
import type { ToolInfo } from '$lib/workspace/toolchainCatalog';
import { installedYear } from './install/texLiveInstallText';
import { m } from '$lib/paraglide/messages';

export const INSTALL_VALUE = 'texpile-install';
export const GUIDE_VALUE = 'install-guide';

export type InstallOffer = { label: string; note?: string };

export type ProgramRow = { tool: ToolInfo; probe: ToolProbe | undefined };

/** the copy that runs: the one the folder list puts first, else the one on PATH, else Texpile's */
export function distroInUse(list: ToolDistro[], active: ToolDistro | null): ToolDistro | null {
	return active ?? list.find((d) => d.onPath) ?? list.find((d) => d.managed) ?? null;
}

export function distroLabel(d: ToolDistro | null): string {
	if (!d) return m.prefs_toolchain_distro_none();
	if (d.onPath) return m.prefs_toolchain_distro_on_path({ name: d.name });
	if (d.managed) return m.prefs_toolchain_distro_managed({ name: d.name });
	return d.name;
}

/** every install, the one in use checked, then Texpile's own when it has one to offer and the install guide */
export function distroGroups(list: ToolDistro[], inUse: ToolDistro | null, offer: InstallOffer | null, guide: string): DropdownGroup[] {
	const groups: DropdownGroup[] = [];
	const options = list.map((d) => ({
		value: d.dir,
		label: d.name,
		note: d.managed ? m.prefs_toolchain_installed_by_texpile() : d.dir,
		checked: d.dir === inUse?.dir
	}));
	if (options.length) groups.push({ options });
	const install = { value: INSTALL_VALUE, label: offer?.label ?? '', note: offer?.note, icon: Download, checked: false };
	const howTo = { value: GUIDE_VALUE, label: guide, icon: ExternalLink, checked: false };
	groups.push({ options: offer ? [install, howTo] : [howTo] });
	return groups;
}

/** the folder list entry a pick of `dir` makes: none for the copy that runs without one */
export function folderFor(list: ToolDistro[], dir: string): string | null {
	const unlisted = list.find((d) => d.onPath) ?? list.find((d) => d.managed);
	return dir === unlisted?.dir ? null : dir;
}

export function texLiveOffer(status: ManagedTexLiveStatus | null, offered: boolean): InstallOffer | null {
	if (!offered || !status || status.megabytes === null) return null;
	if ((installedYear(status.installed?.detail ?? '') ?? 0) >= status.year) return null;
	return {
		label: m.prefs_texlive_install_option({ year: String(status.year) }),
		note: m.prefs_texlive_install_size({ size: String(status.megabytes) })
	};
}

export function tinymistOffer(status: ManagedTinymistStatus | null, offered: boolean): InstallOffer | null {
	if (!offered || !status || status.installed?.version === status.pinned) return null;
	return { label: m.prefs_tinymist_install_option({ version: status.pinned }) };
}

/** a missing or broken program gets a row of its own; the ones that work fold into one line */
export function splitPrograms(rows: ProgramRow[]): { pending: ProgramRow[]; problems: ProgramRow[]; working: ProgramRow[] } {
	function works(r: ProgramRow): boolean {
		return !!r.probe?.found && !r.probe.broken;
	}
	return {
		pending: rows.filter((r) => !r.probe),
		problems: rows.filter((r) => r.probe && !works(r)),
		working: rows.filter(works)
	};
}

export function problemText(probe: ToolProbe | undefined): string {
	if (!probe?.found) return m.prefs_toolchain_missing();
	return probe.timedOut ? m.prefs_toolchain_timed_out({ seconds: '30' }) : m.prefs_toolchain_does_not_run();
}

/** `git 2.43.0` off `git version 2.43.0`: the name, then the first version number the program printed */
export function programWithVersion(name: string, detail: string | undefined): string {
	const version = /\d+\.\d+(?:\.\d+)?[a-z]?/.exec(detail ?? '')?.[0];
	return version ? `${name} ${version}` : name;
}

/** tinymist answers through its own resolve rather than the probe list */
export function tinymistProbe(t: TinymistInfo | null | 'unchecked'): ToolProbe | undefined {
	if (t === 'unchecked') return undefined;
	return { id: 'tinymist', found: !!t, detail: t ? `tinymist ${t.version}` : undefined, command: t?.command ?? 'tinymist' };
}
