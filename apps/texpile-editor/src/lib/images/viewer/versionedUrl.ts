/** the url read again at `version`; a blob url takes no query, and a guest's is new for every version of the file */
export function versionedUrl(url: string, version: number): string {
	if (url.startsWith('blob:')) return url;
	return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}
