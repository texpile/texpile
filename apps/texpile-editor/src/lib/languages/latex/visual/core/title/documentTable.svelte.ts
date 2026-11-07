import { box } from '$lib/runes/box.svelte';
import { BASE_PACKAGE_TABLE, type PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';

export const documentTable = box<PackageTable>(BASE_PACKAGE_TABLE);
