// where the compile is, for the wait before the first pages: each step as it starts and what TeX names as it goes
import { nativeBridge } from '$lib/workspace/fileSystem';

export type CompileStep = 'engine' | 'typeset' | 'bibliography' | 'install' | 'draw';
/** `file` is the package file an install step fetches */
export type StartedStep = { step: CompileStep; pass: number; file?: string };

const NOTES_SHOWN = 6;

export class CompileProgress {
	/** the steps started so far, the last one running; empty outside a compile */
	started = $state.raw<StartedStep[]>([]);
	notes = $state.raw<string[]>([]);
	private unlisten: (() => void) | undefined;

	constructor(private root: () => string) {}

	begin(): void {
		this.started = [{ step: 'engine', pass: 1 }];
		this.notes = [];
		this.unlisten ??= nativeBridge()?.onDraftProgress?.((at) => {
			if (at.root !== this.root() || !this.started.length) return;
			if (at.notes) this.notes = [...this.notes, ...at.notes].slice(-NOTES_SHOWN);
			const pass = at.pass ?? 1;
			// a later pass starts its own engine, which is part of typesetting again
			if (at.step) this.start(at.step === 'engine' && pass > 1 ? 'typeset' : at.step, pass);
		});
	}

	drawing(): void {
		this.start('draw', 1);
	}

	/** Texpile's TeX Live fetches a package file the document lacks; the compile starts over after it */
	installing(file: string): void {
		this.started = [...this.started, { step: 'install', pass: 1, file }];
	}

	end(): void {
		this.started = [];
		this.unlisten?.();
		this.unlisten = undefined;
	}

	private start(step: CompileStep, pass: number): void {
		const last = this.started.at(-1);
		// the passes after the second read as the one line they already have
		if (last?.step === step && (last.pass === pass || last.pass > 1)) return;
		this.started = [...this.started, { step, pass }];
	}
}
