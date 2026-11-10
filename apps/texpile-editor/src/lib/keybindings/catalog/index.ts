import { declareCommands } from '../commands/commandRegistry';
import { COMPILE_COMMANDS } from './compileCatalog';
import { VIEW_COMMANDS } from './viewCatalog';
import { EDITOR_COMMANDS } from './editorCatalog';
import { FILE_COMMANDS } from './fileCatalog';
import { GENERAL_COMMANDS } from './generalCatalog';
import { FORMAT_COMMANDS } from './formatCatalog';
import { EDITING_COMMANDS } from './editingCatalog';
import { FIGURE_COMMANDS } from './figureCatalog';

// in the palette's browse order: compile first, the reason most people reach for a palette in a LaTeX editor
declareCommands([
	...COMPILE_COMMANDS,
	...VIEW_COMMANDS,
	...EDITOR_COMMANDS,
	...FILE_COMMANDS,
	...GENERAL_COMMANDS,
	...FORMAT_COMMANDS,
	...EDITING_COMMANDS,
	...FIGURE_COMMANDS
]);
