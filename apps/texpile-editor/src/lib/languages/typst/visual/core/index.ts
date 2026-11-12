// what a Typst plugin is given: the plugin's shape, the shared faces, the readers and the chip machinery
export type {
	TypstCountedCall,
	TypstDrawer,
	TypstEditorSlot,
	TypstFaceCore,
	TypstNodeViews,
	TypstPlugin,
	TypstUse,
	TypstViewSetup
} from './plugin/typstPlugin';
export * from './document';
export type { BlockInsertItem, InsertItem } from '$lib/editor/visual/insert/insertItem';
export { typGridNode, typTableNode } from '../typstTableNodes';

export { faceElement, sourceHint, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
export { chipHost, quietTemplateSpaces } from '$lib/editor/visual/extensions/chipHost';
export type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
export * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
export { dividerFace } from '$lib/editor/visual/extensions/drawnChips/dividerFace';
export { footnoteFace } from '$lib/editor/visual/extensions/drawnChips/footnoteFace';
export { showGlossaryTerm } from '$lib/editor/visual/extensions/drawnChips/faces/glossaryTerm';
export { settingRow, settingsFace } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
export { horizontalSpaceFace, verticalSpaceFace, type DrawnLength } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
export { tip } from '$lib/components/tooltip.svelte';
export { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
export { referenceStore } from '$lib/stores/editorStore';
export { isReadOnly } from '$lib/stores/permissionStore';
export { citationText } from '$lib/editor/visual/extensions/citation/citationText';
export { default as CitationReferenceField } from '$lib/editor/visual/extensions/citation/CitationReferenceField.svelte';
export { default as CitationPagesField } from '$lib/editor/visual/extensions/citation/CitationPagesField.svelte';
export { bibAuthorShort, bibDisplayText, type BiblatexReference } from '$lib/languages/bib/biblatex';
export { typstTableWrapperView } from '$lib/editor/visual/extensions/table/tableWrapperView.svelte';
export {
	heavierRule,
	tableCaretPlugin,
	tableRulesPlugin,
	type CellAlign,
	type CellEdges,
	type RuleWeight,
	type TableLook
} from '$lib/editor/visual/extensions/table/rules/tableRules';
export { bareTableSettingsPlugin, openBareTableSettings } from '$lib/editor/visual/extensions/table/bare/bareTableSettings.svelte';
export { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
export { default as FigurePlaceholder } from '$lib/draw/host/card/FigurePlaceholder.svelte';

export { typstLengthCss, typstSidesCss } from '../extensions/css/typstLengthCss';
export { cssDeclarations, typstTextDeclarations } from '../extensions/css/typstTextStyle';
export { blockStyle, columnsCss, horizontalAlignment, strokeCss } from '../extensions/layout/layoutDrawing';

export { destroyDrawings, drawArgument, type ArgumentDrawing } from './parts/argumentDrawing';
export { faceOfDrawing, type MarkupDrawing } from './parts/drawingFace';
export { environmentCard } from './parts/environmentCard';
export { faceOf } from './parts/wordsFace';
export { loremText } from './reading/loremText';
export { faceFollowingScope } from './scope/scopeFollowingFace';
export { SET_TARGETS, type SetField } from './setup/setRuleFields';
export { setRuleSummary, setRuleTargetLabel } from './setup/setRuleSummary';
