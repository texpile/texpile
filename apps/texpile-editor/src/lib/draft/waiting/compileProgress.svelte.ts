// where the compile is, for the wait before the first pages: each step as it starts and what TeX names as it goes
import { nativeBridge } from '$lib/workspace/fileSystem';
import { addCompileNotes, lastPageShipped } from './compileNotes';

export type CompileStep = 'engine' | 'typeset' | 'bibliography' | 'install' | 'draw';
/** `file` is the package file an install step fetches, `at` when the step started (performance.now) */
export type StartedStep = { step: CompileStep; pass: number; at: number; file?: string };

const NOTES_SHOWN = 5;

export class CompileProgress {
	/** the steps started so far, the last one running; empty outside a compile */
	started = $state.raw<StartedStep[]>([]);
	notes = $state.raw<string[]>([]);
	/** the last page the running step shipped, 0 before its first */
	page = $state(0);
	/** whole seconds since the compile began */
	seconds = $state(0);
	private unlisten: (() => void) | undefined;
	private clock: ReturnType<typeof setInterval> | undefined;

	constructor(private root: () => string) {}

	begin(): void {
		const began = performance.now();
		this.started = [{ step: 'engine', pass: 1, at: began }];
		this.notes = [];
		this.page = 0;
		this.seconds = 0;
		clearInterval(this.clock);
		this.clock = setInterval(() => (this.seconds = Math.floor((performance.now() - began) / 1000)), 1000);
		this.unlisten ??= nativeBridge()?.onDraftProgress?.((at) => {
			if (at.root !== this.root() || !this.started.length) return;
			const pass = at.pass ?? 1;
			// a later pass starts its own engine, which is part of typesetting again
			if (at.step) this.start(at.step === 'engine' && pass > 1 ? 'typeset' : at.step, pass);
			if (at.notes) {
				this.notes = addCompileNotes(this.notes, at.notes, NOTES_SHOWN);
				this.page = lastPageShipped(at.notes) ?? this.page;
			}
		});
	}

	drawing(): void {
		this.start('draw', 1);
	}

	/** Texpile's TeX Live fetches a package file the document lacks; the compile starts over after it */
	installing(file: string): void {
		this.add({ step: 'install', pass: 1, at: performance.now(), file });
	}

	end(): void {
		this.started = [];
		clearInterval(this.clock);
		this.unlisten?.();
		this.unlisten = undefined;
	}

	private start(step: CompileStep, pass: number): void {
		const last = this.started.at(-1);
		// the passes after the second read as the one line they already have
		if (last?.step === step && (last.pass === pass || last.pass > 1)) return;
		this.add({ step, pass, at: performance.now() });
	}

	private add(next: StartedStep): void {
		this.started = [...this.started, next];
		this.page = 0;
	}
}
