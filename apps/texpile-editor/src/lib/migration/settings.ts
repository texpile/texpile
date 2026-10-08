// Phase B of the migration: an unversioned settings.json (0.16.1 through pre-restructure dev)
// slimmed to the v1 shape, with the relocated fields folded into their new stores. Runs inside
// loadSettings() - the one place settings hydrate - so there is no second reader to race, and the
// layout/users stores are already live (phase A ran before any module initialized).
//
// See ./migrate.ts for the full input inventory and the phase split.

import { updateLayout } from '$lib/storage/layout';
import { updateUserData } from '$lib/storage/userData';
import { readMigrationStash, writeMigrationStash, type MigrationStash } from './migrate';

/** the fields a v1 settings.json may hold; everything else is dropped or relocated */
const V1_SETTINGS_FIELDS = [
	'reopenLastFolder',
	'spellcheck',
	'checkForUpdates',
	'mcpEnabled',
	'mcpPort',
	'uiZoom',
	'whatsNewSeen',
	'mathPreview',
	'commentPill',
	'sourceLineWrap',
	'typstPreviewFollow',
	'editorKeymap',
	'uiLocale',
	'collabRelayUrl',
	'openFolders'
] as const;

/**
 * Slim an unversioned settings object to v1, relocating what moved. Returns the object to persist
 * (via settings:replace), or null when the input is already v1 and nothing needs doing.
 */
export function migrateSettingsObject(raw: Record<string, unknown>): Record<string, unknown> | null {
	if (raw.v === 1) return null;

	// layout fields that lived in settings.json, folded into the blob phase A created
	const layoutPatch: Record<string, unknown> = {};
	if (typeof raw.sidebarOpen === 'boolean') layoutPatch.sidebarOpen = raw.sidebarOpen;
	if (typeof raw.sidebarWidth === 'number') layoutPatch.sidebarWidth = raw.sidebarWidth;
	if (typeof raw.tocFraction === 'number') layoutPatch.tocFraction = raw.tocFraction;
	if (typeof raw.pdfPaneOpen === 'boolean') layoutPatch.pdfPaneOpen = raw.pdfPaneOpen;
	if (typeof raw.terminalVisible === 'boolean') layoutPatch.terminalVisible = raw.terminalVisible;
	if (typeof raw.terminalHeight === 'number') layoutPatch.terminalHeight = raw.terminalHeight;
	if (typeof raw.pdfDarkPages === 'boolean') layoutPatch.pdfDarkPages = raw.pdfDarkPages;
	// (pdfPaneWidth is deliberately not carried: it was dead - never read - in the old code too)
	if (Object.keys(layoutPatch).length) updateLayout(layoutPatch);

	const usersPatch: Record<string, unknown> = {};
	if (Array.isArray(raw.dictionary)) usersPatch.dictionary = raw.dictionary.filter((w): w is string => typeof w === 'string');
	if (typeof raw.commentAuthor === 'string' && raw.commentAuthor) usersPatch.commentAuthor = raw.commentAuthor;
	if (Object.keys(usersPatch).length) updateUserData(usersPatch);

	// the global compile toggles seed each folder's .texpile/config.json as it is first opened;
	// existing stash values win (they were captured first and may already be partially consumed)
	const toggles: NonNullable<MigrationStash['toggles']> = {};
	if (typeof raw.draftMode === 'boolean') toggles.draftMode = raw.draftMode;
	if (typeof raw.typstLiveMode === 'boolean') toggles.typstLiveMode = raw.typstLiveMode;
	if (typeof raw.compileSentinel === 'boolean') toggles.compileSentinel = raw.compileSentinel;
	if (Object.keys(toggles).length) {
		const prev = readMigrationStash();
		writeMigrationStash({ v: 1, ...prev, toggles: { ...toggles, ...prev?.toggles } });
	}

	const out: Record<string, unknown> = { v: 1 };
	for (const k of V1_SETTINGS_FIELDS) if (raw[k] !== undefined) out[k] = raw[k];
	// pre-multi-window installs: the single remembered folder becomes the session-restore list
	if ((!Array.isArray(raw.openFolders) || raw.openFolders.length === 0) && typeof raw.lastFolder === 'string' && raw.lastFolder) {
		out.openFolders = [raw.lastFolder];
	}
	return out;
}
