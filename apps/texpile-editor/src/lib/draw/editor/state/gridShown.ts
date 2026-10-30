const GRID_KEY = 'tikz-editor:grid';

export function readGridShown() {
	try {
		return localStorage.getItem(GRID_KEY) === 'shown';
	} catch {
		return false;
	}
}

export function writeGridShown(shown: boolean) {
	try {
		localStorage.setItem(GRID_KEY, shown ? 'shown' : 'hidden');
	} catch {
		// a private window keeps the choice for the page only
	}
}
