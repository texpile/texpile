// view.canvas.build: the helpers of the node or mark view being built, valid only inside its constructor or update call
import type { CanvasBuildHelpers } from '../contracts/nodeViewTypes';

function outsideBuild(): never {
	throw new Error('view.canvas.build is valid only while a node view builds or updates');
}

export const OUTSIDE_BUILD: CanvasBuildHelpers = {
	get counters() {
		return outsideBuild();
	},
	get settings() {
		return outsideBuild();
	},
	el: outsideBuild,
	read: outsideBuild,
	bitmap: outsideBuild,
	math: outsideBuild,
	icon: outsideBuild,
	checkbox: outsideBuild,
	serializeFragment: outsideBuild,
	overlaySlot: outsideBuild
};

let current: CanvasBuildHelpers = OUTSIDE_BUILD;

export function currentBuild(): CanvasBuildHelpers {
	return current;
}

export function inBuild<T>(tools: CanvasBuildHelpers, run: () => T): T {
	const outer = current;
	current = tools;
	try {
		return run();
	} finally {
		current = outer;
	}
}
