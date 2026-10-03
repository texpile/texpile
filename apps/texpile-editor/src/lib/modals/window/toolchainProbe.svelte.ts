// The toolchain probe's results, held at module scope so revisiting the Preferences tab shows
// what was already found instead of re-spawning every probe process.
import { tinymistMissing } from './missingProgram/missingProgram.svelte';

class ToolchainProbe {
	tinymist = $state<TinymistInfo | null | 'unchecked'>('unchecked');
	probes = $state<ToolProbe[]>([]);
	distros = $state<ToolDistro[]>([]);
	probing = $state(false);
	/** a run has answered, so what is installed is known rather than not yet looked at */
	checked = $state(false);
	/** the probe itself could not run - an old main process, or no desktop bridge at all */
	probeFailed = $state(false);
	/** the rows that have answered in the run under way; the rest still say Checking */
	answered = $state<string[]>([]);
	private runNo = 0;

	async run(): Promise<void> {
		const runNo = ++this.runNo;
		this.probing = true;
		this.probeFailed = false;
		this.answered = [];
		let off: (() => void) | undefined;
		try {
			const bridge = window.texpileTypst;
			if (!bridge?.probeToolchain) throw new Error('no toolchain bridge');
			off = bridge.onProbeResult?.((p) => {
				if (runNo !== this.runNo) return;
				this.probes = [...this.probes.filter((q) => q.id !== p.id), p];
				this.answered = [...this.answered, p.id];
			});
			// in parallel: latexindent alone can take a second, and tinymist resolves separately
			// because it reports more (embedded Typst version, and which location won)
			const tm = bridge.resolve().then((t) => {
				if (runNo !== this.runNo) return t;
				this.tinymist = t;
				// found, once installed or pointed at: the bar and the preview pane stop saying it is missing
				if (t) tinymistMissing.current = false;
				this.answered = [...this.answered, 'tinymist'];
				return t;
			});
			const [tools, , distros] = await Promise.all([bridge.probeToolchain(), tm, bridge.distros?.().catch(() => []) ?? []]);
			if (runNo !== this.runNo) return;
			this.probes = tools;
			this.distros = distros;
		} catch {
			// A FAILED probe is not the same as "nothing is installed", and reporting it as such is
			// how a stale main process made a full TeX Live install look absent. Say we don't know.
			if (runNo !== this.runNo) return;
			this.probeFailed = true;
			this.probes = [];
			this.distros = [];
			this.tinymist = null;
		} finally {
			off?.();
			if (runNo === this.runNo) {
				this.probing = false;
				this.checked = true;
			}
		}
	}

	probeFor(id: string): ToolProbe | undefined {
		return this.probes.find((p) => p.id === id);
	}
}

export const toolchainProbe = new ToolchainProbe();
