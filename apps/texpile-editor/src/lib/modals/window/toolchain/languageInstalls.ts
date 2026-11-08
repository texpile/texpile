// Texpile's own copy for each language, in the one shape a Compiler row reads
import type { Component } from 'svelte';
import { distros } from '../distros.svelte';
import { tinymistInstaller } from '../tinymistInstall.svelte';
import TinymistInstallProgress from '../TinymistInstallProgress.svelte';
import { texLiveInstaller } from './install/texLiveInstall.svelte';
import { installedYear } from './install/texLiveInstallText';
import TexLiveInstallProgress from './install/TexLiveInstallProgress.svelte';
import { texLiveOffer, tinymistOffer, type InstallOffer } from './toolchainRows';
import { m } from '$lib/paraglide/messages';

export type LanguageInstall = {
	readonly family: ToolDistro['family'];
	readonly offer: InstallOffer | null;
	/** what Texpile has installed, with the path as its tooltip; null when it has installed nothing */
	readonly installed: { text: string; path: string } | null;
	readonly step: InstallStep | null;
	readonly busy: boolean;
	readonly progress: Component;
	readonly removeLabel: string;
	readonly cancelLabel: string;
	/** the install guide's page for this language */
	readonly docs: string;
	refresh(): void;
	install(): void;
	cancel(): void;
	remove(): void;
};

export const texLiveInstall: LanguageInstall = {
	family: 'latex',
	get offer() {
		return texLiveOffer(texLiveInstaller.status, texLiveInstaller.offered);
	},
	get installed() {
		const status = texLiveInstaller.status;
		const installed = status?.installed;
		if (!status || !installed) return null;
		if (!installed.detail) return { text: m.prefs_texlive_managed_broken(), path: installed.bin };
		const year = installedYear(installed.detail) ?? status.year;
		return { text: m.prefs_texlive_managed_installed({ year: String(year) }), path: installed.bin };
	},
	get step() {
		return texLiveInstaller.step;
	},
	get busy() {
		return texLiveInstaller.busy;
	},
	progress: TexLiveInstallProgress,
	get removeLabel() {
		return m.texlive_remove();
	},
	get cancelLabel() {
		return m.texlive_install_cancel();
	},
	docs: 'https://texpile.com/docs/installation/latex',
	refresh: () => void texLiveInstaller.refresh(),
	install: () => void texLiveInstaller.install().then((r) => (r?.ok ? distros.useManaged('latex') : undefined)),
	cancel: () => texLiveInstaller.cancel(),
	remove: () => void texLiveInstaller.remove()
};

export const tinymistInstall: LanguageInstall = {
	family: 'typst',
	get offer() {
		return tinymistOffer(tinymistInstaller.status, tinymistInstaller.offered);
	},
	get installed() {
		const installed = tinymistInstaller.status?.installed;
		if (!installed) return null;
		if (!installed.version) return { text: m.prefs_tinymist_managed_broken(), path: installed.command };
		return { text: m.prefs_tinymist_managed_installed({ version: installed.version }), path: installed.command };
	},
	get step() {
		return tinymistInstaller.step;
	},
	get busy() {
		return tinymistInstaller.busy;
	},
	progress: TinymistInstallProgress,
	get removeLabel() {
		return m.tinymist_remove();
	},
	get cancelLabel() {
		return m.tinymist_install_cancel();
	},
	docs: 'https://texpile.com/docs/installation/typst',
	refresh: () => void tinymistInstaller.refresh(),
	install: () => void tinymistInstaller.install().then((r) => (r?.ok ? distros.useManaged('typst') : undefined)),
	cancel: () => tinymistInstaller.cancel(),
	remove: () => void tinymistInstaller.remove()
};
