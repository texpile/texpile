// the CSS animations the editor sheets name, run by the painter: the caret blinks, the remote label linger and the
// jump flash; an unknown one draws its static frame and is reported once in dev (6.5)
import type { AnimationRef } from '../contracts/styleTypes';

/** what an animation sets at a moment: the box's opacity and a share of the keyframes' background; null sets nothing */
export type AnimationFrame = {
	readonly opacity: number | null;
	readonly background: number | null;
	/** ms from now until the frame changes; null when it never will */
	readonly nextMs: number | null;
};

type Ease = (t: number) => number;
/** keyframes over linear progress; the timing function eases within a segment */
type Keyframes = {
	readonly opacity: (progress: number, ease: Ease) => number;
	readonly background: (progress: number, ease: Ease) => number;
	readonly stepped: boolean;
};

const STATIC: AnimationFrame = { opacity: null, background: null, nextMs: null };
// a continuous animation asks for a frame this often
const FRAME_MS = 16;

const KEYFRAMES: Record<string, Keyframes> = {
	// 0% to 49.9% opacity 1, then 0 (app.css); ProseMirror's own visibility blink is the same two halves
	'pm-caret-blink': { opacity: (p) => (p < 0.5 ? 1 : 0), background: () => 0, stepped: true },
	'ProseMirror-cursor-blink': { opacity: (p) => (p < 0.5 ? 1 : 0), background: () => 0, stepped: true },
	'pm-remote-label-linger': { opacity: (p, ease) => (p <= 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3)), background: () => 0, stepped: false },
	'synctex-flash': { opacity: () => 1, background: (p, ease) => 1 - ease(p), stepped: false }
};

const reported = new Set<string>();

function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
	let low = 0;
	let high = 1;
	let t = x;
	for (let i = 0; i < 30; i++) {
		t = (low + high) / 2;
		const at = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
		if (at < x) low = t;
		else high = t;
	}
	return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

const BEZIERS: Record<string, readonly [number, number, number, number]> = {
	ease: [0.25, 0.1, 0.25, 1],
	'ease-in': [0.42, 0, 1, 1],
	'ease-out': [0, 0, 0.58, 1],
	'ease-in-out': [0.42, 0, 0.58, 1]
};

/** a computed timing function at progress t: linear, the keywords, cubic-bezier() and steps() */
export function easedProgress(timing: string, t: number): number {
	const value = timing.trim();
	if (value === 'step-end') return t < 1 ? 0 : 1;
	if (value === 'step-start') return t > 0 ? 1 : 0;
	const steps = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+))?\s*\)$/.exec(value);
	if (steps) {
		const count = Number(steps[1]);
		const start = steps[2] === 'start' || steps[2] === 'jump-start';
		return Math.min(1, (Math.floor(t * count) + (start ? 1 : 0)) / count);
	}
	const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(value);
	const points = bezier ? (bezier[1].split(',').map(Number) as [number, number, number, number]) : BEZIERS[value];
	return points ? cubicBezier(points[0], points[1], points[2], points[3], t) : t;
}

/** the animation's frame elapsedMs after it started; iterations, delay and direction as computed */
export function animationFrameAt(ref: AnimationRef, elapsedMs: number, dev = import.meta.env?.DEV ?? false): AnimationFrame {
	const keyframes = KEYFRAMES[ref.name];
	if (!keyframes) {
		if (dev && !reported.has(ref.name)) {
			reported.add(ref.name);
			console.warn(`canvas: the animation ${ref.name} draws its static frame`);
		}
		return STATIC;
	}
	const duration = Math.max(1, ref.durationMs);
	const running = elapsedMs - ref.delayMs;
	function ease(t: number): number {
		return easedProgress(ref.timing, t);
	}
	if (running < 0) return { opacity: keyframes.opacity(0, ease), background: keyframes.background(0, ease), nextMs: -running };
	const iteration = Math.floor(running / duration);
	if (ref.playState === 'paused' || iteration >= ref.iterations) {
		const filled = ref.fillMode === 'forwards' || ref.fillMode === 'both';
		return filled ? { opacity: keyframes.opacity(1, ease), background: keyframes.background(1, ease), nextMs: null } : STATIC;
	}
	const within = (running % duration) / duration;
	const reversed =
		ref.direction === 'reverse' || (ref.direction.startsWith('alternate') && iteration % 2 === (ref.direction === 'alternate' ? 1 : 0));
	const progress = reversed ? 1 - within : within;
	const nextMs = keyframes.stepped ? duration / 2 - ((running % duration) % (duration / 2)) : FRAME_MS;
	return { opacity: keyframes.opacity(progress, ease), background: keyframes.background(progress, ease), nextMs };
}
