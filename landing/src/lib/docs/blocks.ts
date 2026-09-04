// What a docs page renders as: prose HTML, and the few shapes drawn by their own components.

export interface FigureItem {
	/** the asset's path from the landing root, e.g. "/src/lib/assets/showcase/app/start-screen.png" */
	src: string;
	alt: string;
	caption?: string;
	video: boolean;
}

export interface CardItem {
	href: string;
	title: string;
	blurb: string;
	icon?: string;
}

export interface LinkItem {
	href: string;
	label: string;
	external: boolean;
}

export type Block =
	| { kind: 'html'; html: string }
	| { kind: 'note'; html: string }
	| { kind: 'figure'; items: FigureItem[]; narrow: boolean }
	| { kind: 'where'; rows: { label: string; value: string; note?: string }[] }
	| { kind: 'keys'; rows: { keys: string; label: string }[] }
	| { kind: 'cards'; items: CardItem[] }
	| { kind: 'links'; items: LinkItem[] };
