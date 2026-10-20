// scripts/packageData.ts: the ids of the bundled package files, such as packages/siunitx
declare module 'virtual:bundled-package-ids' {
	const ids: string[];
	// eslint-disable-next-line no-restricted-exports -- a virtual module's one value
	export default ids;
}
