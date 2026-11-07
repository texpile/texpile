// the commands that end the head and foot sections of a longtable
export const LONGTABLE_MARKERS = ['endfirsthead', 'endhead', 'endfoot', 'endlastfoot'] as const;
export type LongtableMarker = (typeof LONGTABLE_MARKERS)[number];

export function isLongtableMarker(name: string): name is LongtableMarker {
	return (LONGTABLE_MARKERS as readonly string[]).includes(name);
}
