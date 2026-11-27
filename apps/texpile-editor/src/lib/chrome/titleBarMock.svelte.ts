// MOCKUP ONLY: localStorage titleBarMock = '' | 'a' | 'b' | 'c' picks a title bar design to compare
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { cellOf, tracksOf } from '$lib/workspace/groups/layouts';

function read(): string {
	try {
		return localStorage.getItem('titleBarMock') ?? '';
	} catch {
		return '';
	}
}

class TitleBarMock {
	design = $state(read());
	constructor() {
		if (typeof window !== 'undefined') window.addEventListener('title-bar-mock', () => (this.design = read()));
	}
	get a() {
		return this.design === 'a';
	}
	get b() {
		return this.design === 'b';
	}
	get c() {
		return this.design === 'c';
	}
	/** F: the agent button beside the search field */
	openAgent = $state<(() => void) | null>(null);
	get f() {
		return this.design === 'f';
	}
	/** G: the counts and the agent flank the search field; H: G plus the session after the menus */
	get g() {
		return this.design === 'g' || this.design === 'h';
	}
	flanks = $state(false);
	get h() {
		return this.design === 'h';
	}
	get d() {
		return this.design === 'd';
	}
	get e() {
		return this.design === 'e';
	}
	/** faces without the guest count, edit mode without its arrow */
	get trim() {
		return this.a || this.d || this.e || this.f;
	}
}

export const titleBarMock = new TitleBarMock();

/** the group whose strip is the top right of the editors */
export function isTopRightGroup(id: number | undefined): boolean {
	const grid = editorGroups.grid;
	const i = grid.findIndex((g) => g.id === id);
	if (i < 0) return grid.length <= 1;
	const cell = cellOf(editorGroups.layout, i);
	return cell.row === 0 && cell.column === tracksOf(editorGroups.layout).columns - 1;
}
