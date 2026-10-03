// Texpile's own copy of tinymist as every window sees it: the one install under way (whichever
// window started it), how the last one ended, and what is on disk. Held at module scope so the
// Toolchain tab, the missing-typesetter dialog and the Typst banner all show the same install.
import { toolchainProbe } from './toolchainProbe.svelte';

function bridge(): TexpileTypstBridge | undefined {
	return typeof window !== 'undefined' ? window.texpileTypst : undefined;
}

class TinymistInstaller {
	status = $state<ManagedTinymistStatus | null>(null);
	/** non-null while an install runs */
	step = $state<TinymistInstallStep | null>(null);
	/** how the last install or removal failed; cleared by the next attempt */
	failure = $state<Extract<TinymistInstallResult, { ok: false }> | null>(null);
	removing = $state(false);
	private listening = false;

	/** this main process can install tinymist at all */
	get available(): boolean {
		return !!bridge()?.installTinymist;
	}

	get busy(): boolean {
		return this.step !== null || this.removing;
	}

	/** the offer is worth making: a build exists for this machine */
	get offered(): boolean {
		return this.available && !!this.status?.supported;
	}

	async refresh(): Promise<void> {
		const b = bridge();
		if (!b?.tinymistStatus) return;
		this.listen(b);
		try {
			const status = await b.tinymistStatus();
			this.status = status;
			if (status.step) this.step = status.step;
		} catch {
			this.status = null;
		}
	}

	/** resolves to how it ended, or null without a bridge that installs */
	async install(): Promise<TinymistInstallResult | null> {
		const b = bridge();
		if (!b?.installTinymist) return null;
		this.listen(b);
		this.failure = null;
		this.step = { phase: 'download', received: 0, total: 0 };
		const result = await b.installTinymist();
		// main's broadcast, which reaches this window too, has already reported it
		if (!b.onTinymistFinished) this.finish(result);
		return result;
	}

	cancel(): void {
		bridge()?.cancelTinymistInstall?.();
	}

	async remove(): Promise<void> {
		const b = bridge();
		if (!b?.removeTinymist) return;
		this.listen(b);
		this.failure = null;
		this.removing = true;
		try {
			const result = await b.removeTinymist();
			if (!b.onTinymistFinished) this.finish(result);
		} finally {
			this.removing = false;
		}
	}

	// progress and outcome come from main for every window, so one started elsewhere shows here too
	private listen(b: TexpileTypstBridge): void {
		if (this.listening) return;
		this.listening = true;
		b.onTinymistProgress?.((step) => (this.step = step));
		b.onTinymistFinished?.((result) => this.finish(result));
	}

	private finish(result: TinymistInstallResult): void {
		this.step = null;
		this.failure = result.ok || result.reason === 'cancelled' ? null : result;
		if (!result.ok) return;
		void this.refresh();
		// a probe under way may have looked before the copy was in place; a new run supersedes it
		if (toolchainProbe.tinymist !== 'unchecked' || toolchainProbe.probing) void toolchainProbe.run();
	}
}

export const tinymistInstaller = new TinymistInstaller();
