import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { FocusManager } from 'utils/focusManager';
import { getFocusInfo, isIntermediateFocusInfo, isListFocusInfo, toIntermediateFocusInfo } from 'utils/info';
import { FocusPluginLogger } from 'utils/log';
import { 
	EditModeFocusManager, 
	focusStateField, 
	focusDecorationsField
} from 'utils/editModeFocusManager';
interface FocusPluginSettings {
	clearMethod: 'click-again' | 'click-outside';
	contentBehavior: 'element' | 'content' | 'none';
	focusScope: 'block' | 'content';
	enableList: boolean;
	focusSensitivity: number;
	indicator: boolean;
	isEnabled: boolean;
}

const DEFAULT_SETTINGS: FocusPluginSettings = {
	clearMethod: 'click-again',
	contentBehavior: 'none',
	focusScope: 'content',
	enableList: false,
	focusSensitivity: 1600,
	indicator: true,
	isEnabled: true,
}

interface PaneState {
	mode: string;
	head: Element;
}

export default class FocusPlugin extends Plugin {
	settings: FocusPluginSettings;
	focusManager: FocusManager = new FocusManager();
	editModeFocusManager: EditModeFocusManager = new EditModeFocusManager();
	lastClick = 0;
	indicator: HTMLElement | null = null;
	indicatorEl: HTMLElement = document.createElement("div");
	private editorExtensions: Extension[] = [];

	private getPaneState(): PaneState | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view)
			return null;

		return {
			mode: view.getMode(),
			head: view.contentEl.querySelector('.markdown-preview-section') as Element
		}
	}

	private getEditorView(): EditorView | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return null;
		
		// @ts-ignore - accessing internal CM6 editor
		const editor = view.editor?.cm as EditorView;
		return editor || null;
	}

	async onload() {

		await this.loadSettings();

		// Register CodeMirror 6 extensions for edit mode
		this.editorExtensions = [focusStateField, focusDecorationsField];
		this.registerEditorExtension(this.editorExtensions);

		this.addCommand({
			id: 'clear-focus',
			name: 'Clear Focus',
			callback: () => {
				this.focusManager.clearAll();
				// Also clear edit mode focus
				const editorView = this.getEditorView();
				if (editorView) {
					this.editModeFocusManager.clearFocus(editorView);
				}
			}
		});

		this.addCommand({
			id: 'toggle-focus-mode',
			name: 'Toggle Focus Mode',
			callback: () => {
				this.toggle();
			}
		});

		this.addSettingTab(new FocusPluginSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on('layout-change', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			const mode = view.getMode();
			
			if (mode === 'preview') {
				const paneState = this.getPaneState();
				if (paneState) {
					this.focusManager.clear(paneState.head);
				}
				// Clear edit mode focus when switching to preview
				const editorView = this.getEditorView();
				if (editorView) {
					this.editModeFocusManager.clearFocus(editorView);
				}
			} else if (mode === 'source') {
				// Clear preview mode focus when switching to edit
				this.focusManager.clearAll();
			}
		}));

		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			const mode = view.getMode();
			
			if (mode === 'preview') {
				const paneState = this.getPaneState();
				if (paneState) {
					this.focusManager.changePane(paneState.head);
				}
			}
			// For edit mode, focus is handled by CM6 state
		}));

		this.registerDomEvent(document, 'pointerdown', (evt: PointerEvent) => {
			this.lastClick = evt.timeStamp;
		})

		this.registerDomEvent(document, 'pointerup', (evt: MouseEvent) => {
			if (!this.settings.isEnabled)
				return;

			if (evt.timeStamp - this.lastClick > this.settings.focusSensitivity)
				return;

			if (!(evt.target instanceof Element))
				return;

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view)
				return;

			const mode = view.getMode();

			// Handle preview mode (existing logic)
			if (mode === 'preview') {
				const paneState = this.getPaneState();
				if (!paneState)
					return;

				let focusInfo = getFocusInfo(evt.target)

				// fallback to intermediate focus if list is disabled
				if (!this.settings.enableList && isListFocusInfo(focusInfo))
					focusInfo = toIntermediateFocusInfo(focusInfo);

				if (isIntermediateFocusInfo(focusInfo) && this.settings.contentBehavior === 'none')
					return;
				
				const currentFocus = this.focusManager.getFocus(paneState.head);
				if (currentFocus !== undefined) {
					switch (this.settings.clearMethod) {
						case 'click-again':
							if (focusInfo && this.focusManager.isSameFocus(paneState.head, focusInfo)) {
								this.focusManager.clear(paneState.head);
								return;
							}
							break;
						case 'click-outside':
							if (evt.target.classList.contains('markdown-preview-view')) {
								this.focusManager.clear(paneState.head);
								return;
							}
							break;
					}
				}

				if (isIntermediateFocusInfo(focusInfo)) {
					const activeFile = this.app.workspace.getActiveFile();
					const metadata = activeFile !== null ? this.app.metadataCache.getFileCache(activeFile) : null;
					if (metadata) {
						switch (this.settings.contentBehavior) {
							case 'content':
								focusInfo.metadata = metadata;
								// fall through
							case 'element':
								this.focusManager.focus(paneState.head, focusInfo);
								break;
							default:
								break;
						}
					}
					else {
						FocusPluginLogger.log('Error', 'No metadata found for active file');
					}
				}
				else if (focusInfo != null)
					this.focusManager.focus(paneState.head, focusInfo);
			}
			// Handle edit/source mode (new logic)
			else if (mode === 'source') {
				this.handleEditModeClick(evt, view);
			}
		});
	}

	private handleEditModeClick(evt: MouseEvent, view: MarkdownView) {
		const editorView = this.getEditorView();
		if (!editorView) return;

		// Get active file metadata
		const activeFile = this.app.workspace.getActiveFile();
		const metadata = activeFile ? this.app.metadataCache.getFileCache(activeFile) : null;
		this.editModeFocusManager.setMetadata(metadata);

		// Get clicked position in the editor
		const pos = editorView.posAtCoords({ x: evt.clientX, y: evt.clientY });
		if (!pos) return;

		// Convert position to line number
		const line = editorView.state.doc.lineAt(pos);
		const lineNumber = line.number;

		// Check if clicking on same line again (to clear focus)
		const currentFocus = editorView.state.field(focusStateField, false);
		if (currentFocus && this.settings.clearMethod === 'click-again') {
			if (lineNumber >= currentFocus.fromLine && lineNumber <= currentFocus.toLine) {
				this.editModeFocusManager.clearFocus(editorView);
				return;
			}
		}

		// Check if clicking outside focused area (to clear focus)
		if (currentFocus && this.settings.clearMethod === 'click-outside') {
			// Check if clicked on gutter or outside content
			if (evt.target instanceof Element && 
				(evt.target.classList.contains('cm-gutters') || 
				evt.target.classList.contains('cm-editor'))) {
				this.editModeFocusManager.clearFocus(editorView);
				return;
			}
		}

		// Get focus info for clicked line
		const focusInfo = this.editModeFocusManager.getFocusInfoForLine(
			lineNumber, 
			editorView.state.doc
		);

		if (focusInfo) {
			this.editModeFocusManager.applyFocus(editorView, focusInfo);
		}
	}

	onunload() {
		this.focusManager.destroy();
		
		// Clear edit mode focus
		const editorView = this.getEditorView();
		if (editorView) {
			this.editModeFocusManager.clearFocus(editorView);
		}
	}

	private async settingsPreprocessor(settings: FocusPluginSettings) {
		this.focusManager.clearAll();
		this.focusManager.includeBody = settings.focusScope === 'content';
		
		// Update edit mode manager settings
		this.editModeFocusManager.setIncludeBody(settings.focusScope === 'content');
		
		// Clear edit mode focus
		const editorView = this.getEditorView();
		if (editorView) {
			this.editModeFocusManager.clearFocus(editorView);
		}

		if (settings.indicator && !this.indicator) {
			this.indicator = this.addStatusBarItem();
			this.indicator.appendChild(this.indicatorEl);
			this.indicator.classList.add('mod-clickable');
			this.indicator.onclick = () => this.toggle();
		}
		else if (!settings.indicator && this.indicator) {
			this.indicator.remove();
			this.indicator = null;
		}

		if (settings.isEnabled){
			this.indicatorEl.innerHTML = 'Focus: on';
			this.focusManager.init();
		}
		else {
			this.indicatorEl.innerHTML = 'Focus: off';
			this.focusManager.destroy();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		await this.settingsPreprocessor(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.settingsPreprocessor(this.settings);
	}

	async toggle() {
		this.settings.isEnabled = !this.settings.isEnabled;
		await this.saveSettings();
	}
}

class FocusPluginSettingTab extends PluginSettingTab {
	plugin: FocusPlugin;

	constructor(app: App, plugin: FocusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Focus and Highlight Settings' });

		new Setting(containerEl)
			.setName('Enabled Focus Mode')
			.setDesc('Enable the focus feature')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.isEnabled)
				.onChange(async (value: FocusPluginSettings["isEnabled"]) => {
					this.plugin.settings.isEnabled = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'isEnable changed to ' + value);
				}));

		new Setting(containerEl)
			.setName('Clear Method')
			.setDesc('How to clear the focused elements')
			.addDropdown(dropdown => dropdown.addOptions({
				'click-again': 'Click again',
				'click-outside': 'Click outside',
			})
				.setValue(this.plugin.settings.clearMethod)
				.onChange(async (value: FocusPluginSettings["clearMethod"]) => {
					this.plugin.settings.clearMethod = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'clear method changed to ' + value);
				}));

		new Setting(containerEl)
			.setName('Focus Scope')
			.setDesc('What to focus when clicking')
			.addDropdown(dropdown => dropdown.addOptions({
				'block': 'Only one block',
				'content': 'Also the content'
			})
				.setValue(this.plugin.settings.focusScope)
				.onChange(async (value: FocusPluginSettings["focusScope"]) => {
					this.plugin.settings.focusScope = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'focus scope changed to ' + value);
				}));

		new Setting(containerEl)
			.setName('Content Behavior')
			.setDesc('What to do when clicking on the content elements, e.g. pure text, callout block')
			.addDropdown(dropdown => dropdown.addOptions({
				'element': 'Only focus on the element',
				'content': 'Focus related contents',
				'none': 'Do nothing'

			})
				.setValue(this.plugin.settings.contentBehavior)
				.onChange(async (value: FocusPluginSettings["contentBehavior"]) => {
					this.plugin.settings.contentBehavior = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'content behavior changed to ' + value);
				}));

		new Setting(containerEl)
			.setName('Enable List')
			.setDesc('Focus on the list item (experimental, only works on the first level list)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableList)
				.onChange(async (value: FocusPluginSettings["enableList"]) => {
					this.plugin.settings.enableList = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'enable list changed to ' + value);
				}));

			new Setting(containerEl)
			.setName('Enable Status Indicator')
			.setDesc('Show the status indicator in the status bar')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.indicator)
				.onChange(async (value: FocusPluginSettings["indicator"]) => {
					this.plugin.settings.indicator = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'indicator changed to ' + value);
				}));

		new Setting(containerEl)
			.setName('Focus Sensitivity')
			.setDesc("Focus only when the mouse is 'not' still for a while (larger means longer)")
			.addSlider(slider => slider
				.setLimits(100, 10100, 500)
				.setValue(this.plugin.settings.focusSensitivity)
				.onChange(async (value: FocusPluginSettings["focusSensitivity"]) => {
					this.plugin.settings.focusSensitivity = value;
					await this.plugin.saveSettings();
					FocusPluginLogger.log('Debug', 'focus delay changed to ' + value);
				}));

	}
}
