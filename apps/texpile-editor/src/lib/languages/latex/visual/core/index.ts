export type {
	LatexCountedCall,
	LatexFaceAnswer,
	LatexFaceCore,
	LatexNodeViews,
	LatexPart,
	LatexPlugin,
	LatexViewSetup,
	UnitsDrawer
} from './plugin/latexPlugin';
export type { LatexArgumentContext, LatexArguments, LatexInsertContext, LatexInsertOffer } from './plugin/latexInsert';
export { argumentSlots, renameEnvironment } from './plugin/latexInsert';
export { optionalArgumentOffers } from './plugin/argumentGroups';
export { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
export { wrapInListItems } from '../listItemIndent';
export { createTableNode } from '$lib/editor/visual/tableUtils';
export { computeMathAttrs, numberedEquationAttrs } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
export type { BlockInsertItem, InsertArgument, InsertItem } from '$lib/editor/visual/insert/insertItem';

export { faceElement, faceOfParts, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
export {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel,
	type ChipSettingsProps
} from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
export { openFieldPanel } from '$lib/editor/visual/extensions/drawnChips/fieldPanel';
export { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
export * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
export { dividerFace } from '$lib/editor/visual/extensions/drawnChips/dividerFace';
export { footnoteFace } from '$lib/editor/visual/extensions/drawnChips/footnoteFace';
export { graphicFace } from '$lib/editor/visual/extensions/drawnChips/faces/graphicFace';
export { labelFace } from '$lib/editor/visual/extensions/drawnChips/faces/labelFace';
export { showGlossaryTerm } from '$lib/editor/visual/extensions/drawnChips/faces/glossaryTerm';
export { horizontalSpaceFace, verticalSpaceFace } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
export { citationGroupsText, citedWorks, type CitedGroup } from '$lib/editor/visual/extensions/citation/citationText';
export { tip } from '$lib/components/tooltip.svelte';
export { returnFocusToText } from '$lib/editor/visual/extensions/popoverFocus/returnFocus';
export { offerPopover } from '$lib/editor/visual/extensions/popoverFocus/atomPopovers';

export {
	HORIZONTAL_SPACES,
	MARGIN_NOTES,
	PAGE_BREAKS,
	REFERENCES,
	STYLED,
	SWITCHES,
	VERTICAL_SKIPS
} from '$lib/languages/latex/drawnCommands';
export { scanGlossary, type GlossEntry } from '$lib/languages/latex/intellisense/completion/glossary';
export type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
export { bodyOf, environmentName, type Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
export { argText, hasStar, mandatoryArgs, optionalArg, type TreeArg, type TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
export { readEnvironment } from '$lib/languages/latex/parser/tree/walk/treeEnvironment';

export { onDrawnInputs } from './drawnInputs.svelte';
export { ownMacroDefinition } from './own/ownMacroFace.svelte';
export { characterPart, coloredPart, styledPart } from './parts/textParts';
export { declaresSetting } from './parts/plainCommands';
export { isSpacePart, trimmedParts } from './parts/spaceParts';
export { balancedBraces } from './reading/balancedBraces';
export { textUnitsWith } from './reading/chipUnits';
export { destroyParts, hasArgs, isBlank } from './reading/drawing';
export { readableText } from './reading/readableText';
export { argWhere, hasRole, readingsOf, readsArg } from './reading/readingArgs';
export { cssColor } from './reading/texColor';
export { lengthLabel, texLength } from './reading/texLength';
export { DEFAULT_CROSS_REF_NAMES, type CrossRefNames } from './references/crossRefNames';
export { bibStyleNames } from './references/bibliographyKind';
export { deckPreamble } from './title/deckPreamble.svelte';
export { documentTable } from './title/documentTable.svelte';

export { splitCitationKeys } from '../extensions/citation/citationKeys';
export { floatName } from './references/floatName';
export { undefinedRefs } from '../extensions/ref/undefinedRefs.svelte';

export { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
export { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';

export { cachedDrawing, loadSavedDrawing, onDrawingsChange, pictureKey } from '$lib/draw/host/drawingCache';
export { onCompiledChange, resolveCardPicture } from '$lib/draw/host/card/compiled/compiledPictures.svelte';
export { OPEN_FIGURE, type OpenFigureDetail } from '$lib/draw/host/card/figureEvents';
export { figureSummary } from '$lib/draw/host/card/figureSummary';
export { default as FigureCard } from '$lib/draw/host/card/FigureCard.svelte';
export { default as FigurePlaceholder } from '$lib/draw/host/card/FigurePlaceholder.svelte';
export { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
export { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
export { offerBlockSettings, settingsPlace, type GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
export { citationText } from '$lib/editor/visual/extensions/citation/citationText';
export { citationVariantKind } from '$lib/languages/latex/visual/extensions/citation/citationVariantKind';
export { default as CitationReferenceField } from '$lib/editor/visual/extensions/citation/CitationReferenceField.svelte';
export { default as CitationPagesField } from '$lib/editor/visual/extensions/citation/CitationPagesField.svelte';
export { chipHost } from '$lib/editor/visual/extensions/chipHost';
export { quietTemplateSpaces } from '$lib/editor/visual/extensions/chipHost';
export { jumpToLabel } from '$lib/languages/latex/visual/extensions/ref/jumpToLabel';
export { sanitizeLabel } from '$lib/editor/visual/label';
export { liveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
export { refProblemText } from '$lib/workspace/document/liveRefDiagnostics';
export { labelTaken } from '$lib/editor/visual/labelTaken';
export { announceLabelRenamed } from '$lib/editor/visual/repointRefs';
export { repointRefs } from '$lib/editor/visual/repointRefs';
export { bibliographyName } from '$lib/languages/latex/visual/extensions/bibliography/bibliographyName';
export { keyedEntriesInDoc } from '$lib/languages/latex/visual/extensions/bibliography/bibliographyEntries';
export type { KeyedEntry } from '$lib/languages/latex/visual/extensions/bibliography/bibliographyEntries';
export { orderedRuns } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
export type { ItemLabels } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
export { printedValue } from '$lib/languages/latex/visual/extensions/numbers/printedNumber';
export type { NumberStyle } from '$lib/languages/latex/visual/extensions/numbers/printedNumber';
export { isReadOnly } from '$lib/stores/permissionStore';
export { compiledNumbersOf } from '$lib/editor/visual/extensions/nodeNumbers';
export {
	heavierRule,
	linesOfEdges,
	tableCaretPlugin,
	tableRulesPlugin,
	type CellAlign,
	type CellEdges,
	type RuleWeight,
	type TableLines,
	type TableLook
} from '$lib/editor/visual/extensions/table/rules/tableRules';
export { editPreambleHere } from '$lib/stores/editorStore';
export { withPackageNeeded } from '$lib/languages/latex/intellisense/packages/packageNeed';
export { bareTableSettingsPlugin, openBareTableSettings } from '$lib/editor/visual/extensions/table/bare/bareTableSettings.svelte';
export { adoptParse } from '$lib/editor/visual/parseOrigins';
export { containerOriginsOf } from '$lib/editor/visual/parseOrigins';
export { containerRecordAround } from '$lib/editor/visual/parseOrigins';
export { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
export { IncludeDocView } from '$lib/editor/visual/extensions/includedoc/includeDocView.svelte';
export { tableWrapperView } from '$lib/editor/visual/extensions/table/tableWrapperView.svelte';
export { listNumbersPlugin } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
