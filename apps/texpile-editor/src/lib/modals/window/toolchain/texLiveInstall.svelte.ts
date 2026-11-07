// Texpile's own TeX Live as every window sees it, as for tinymist (tinymistInstall.svelte.ts): the one install under
// way, how the last one ended, and what is on disk
import { toolchainProbe } from '../toolchainProbe.svelte';
import { toolDirs } from '../toolDirs.svelte';

function bridge(): TexpileTexLiveBridge | undefined {
	return typeof window !== 'undefined' ? window.texpileTexLive : undefined;
}

class TexLiveInstaller {
	status = $state<ManagedTexLiveStatus | null>(null);
	/** non-null while an install runs */
	step = $state<InstallStep | null>(null);
	/** how the last install or removal failed; cleared by the next attempt */
	failure = $state<Extract<TexLiveInstallResult, { ok: false }> | null>(null);
	removing = $state(false);
	private listening = false;

	get busy(): boolean {
		return this.step !== null || this.removing;
	}

	/** this main process installs TeX Live, and Texpile has a build for this computer */
	get offered(): boolean {
		return !!bridge() && this.status?.megabytes != null;
	}

	async refresh(): Promise<void> {
		const b = bridge();
		if (!b) return;
		this.listen(b);
		try {
			const status = await b.status();
			this.status = status;
			if (status.step) this.step = status.step;
		} catch {
			this.status = null;
		}
	}

	async install(): Promise<void> {
		const b = bridge();
		if (!b) return;
		this.listen(b);
		this.failure = null;
		this.step = { phase: 'download', received: 0, total: 0 };
		// main's broadcast, which reaches this window too, reports how it ended
		await b.install();
	}

	cancel(): void {
		bridge()?.cancel();
	}

	async remove(): Promise<void> {
		const b = bridge();
		if (!b) return;
		this.listen(b);
		this.failure = null;
		this.removing = true;
		const bin = this.status?.installed?.bin ?? null;
		try {
			const result = await b.remove();
			// a Distribution pick of the tree that is gone leaves PATH as it was before it
			if (result.ok && bin) await toolDirs.forget(bin);
		} finally {
			this.removing = false;
		}
	}

	private listen(b: TexpileTexLiveBridge): void {
		if (this.listening) return;
		this.listening = true;
		b.onProgress((step) => (this.step = step));
		b.onFinished((result) => this.finish(result));
	}

	private finish(result: TexLiveInstallResult): void {
		this.step = null;
		this.failure = result.ok || result.reason === 'cancelled' ? null : result;
		if (!result.ok) return;
		void this.refresh();
		// PATH changed: every program and distribution is looked for again
		void toolchainProbe.run();
	}
}

export const texLiveInstaller = new TexLiveInstaller();
