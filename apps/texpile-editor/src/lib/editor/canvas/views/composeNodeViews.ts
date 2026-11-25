// one set of node views from the plugins' canvasViews; a type two plugins draw is a bug, as pluginNodeViews treats it
import type { CanvasViewSet } from '../contracts/nodeViewTypes';
import type { CanvasProps } from '../contracts/viewTypes';

type ComposedViews = { [K in keyof CanvasViewSet]-?: NonNullable<CanvasViewSet[K]> };

function joined<T>(parts: readonly (Readonly<Record<string, T>> | undefined)[], what: string): Record<string, T> {
	const into: Record<string, T> = {};
	for (const part of parts)
		for (const [name, value] of Object.entries(part ?? {})) {
			if (Object.hasOwn(into, name)) throw new Error(`two plugins give the ${what} ${name}`);
			into[name] = value;
		}
	return into;
}

export function composeNodeViews(...sets: readonly CanvasViewSet[]): ComposedViews {
	return {
		nodeViews: joined(
			sets.map((set) => set.nodeViews),
			'node view of'
		),
		markViews: joined(
			sets.map((set) => set.markViews),
			'mark view of'
		),
		estimates: joined(
			sets.map((set) => set.estimates),
			'estimate of'
		),
		blockSettings: joined(
			sets.map((set) => set.blockSettings),
			'block settings of'
		)
	};
}

export type CanvasViewProps = Pick<CanvasProps, 'nodeViews' | 'markViews' | 'nodeEstimates' | 'blockSettings'>;

/** what a mount passes the view */
export function canvasViewProps(views: ComposedViews): CanvasViewProps {
	return { nodeViews: views.nodeViews, markViews: views.markViews, nodeEstimates: views.estimates, blockSettings: views.blockSettings };
}
