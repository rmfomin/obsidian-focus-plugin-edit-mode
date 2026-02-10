import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { CachedMetadata } from 'obsidian';
import { FocusPluginLogger } from './log';

// Types for focus information in edit mode
export interface EditModeFocusInfo {
	fromLine: number;
	toLine: number;
	type: 'heading' | 'paragraph' | 'list' | 'block';
	level?: number; // For headings: 1-6
}

// State effect to update focus
export const setFocusEffect = StateEffect.define<EditModeFocusInfo | null>();

// State effect to clear focus
export const clearFocusEffect = StateEffect.define<null>();

// Decoration for dimmed lines
const dimmedLineMark = Decoration.line({
	class: 'focus-plugin-dimmed-line'
});

// Decoration for focused lines (remove dimming if present)
const focusedLineMark = Decoration.line({
	class: 'focus-plugin-focused-line'
});

// State field to track current focus
export const focusStateField = StateField.define<EditModeFocusInfo | null>({
	create() {
		return null;
	},
	update(value, tr) {
		for (let effect of tr.effects) {
			if (effect.is(setFocusEffect)) {
				return effect.value;
			}
			if (effect.is(clearFocusEffect)) {
				return null;
			}
		}
		return value;
	}
});

// State field for decorations
export const focusDecorationsField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		decorations = decorations.map(tr.changes);
		
		for (let effect of tr.effects) {
			if (effect.is(setFocusEffect) || effect.is(clearFocusEffect)) {
				const focusInfo = tr.state.field(focusStateField);
				decorations = buildDecorations(tr.state.doc, focusInfo);
			}
		}
		
		return decorations;
	},
	provide: f => EditorView.decorations.from(f)
});

// Build decorations based on focus info
function buildDecorations(doc: any, focusInfo: EditModeFocusInfo | null): DecorationSet {
	if (!focusInfo) {
		return Decoration.none;
	}
	
	const builder = new RangeSetBuilder<Decoration>();
	const totalLines = doc.lines;
	
	// Add dimmed decoration to all lines except focused ones
	for (let i = 1; i <= totalLines; i++) {
		const line = doc.line(i);
		
		if (i >= focusInfo.fromLine && i <= focusInfo.toLine) {
			// This is a focused line - don't dim it
			builder.add(line.from, line.from, focusedLineMark);
		} else {
			// Dim this line
			builder.add(line.from, line.from, dimmedLineMark);
		}
	}
	
	return builder.finish();
}

export class EditModeFocusManager {
	private metadata: CachedMetadata | null = null;
	private includeBody: boolean = true;

	setMetadata(metadata: CachedMetadata | null) {
		this.metadata = metadata;
	}

	setIncludeBody(includeBody: boolean) {
		this.includeBody = includeBody;
	}

	/**
	 * Get focus info for a given line number
	 */
	getFocusInfoForLine(lineNumber: number, doc: any): EditModeFocusInfo | null {
		const line = doc.line(lineNumber);
		const lineText = line.text;

		// Check if this line is a heading
		const headingMatch = lineText.match(/^(#{1,6})\s+(.+)/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			return this.getHeadingFocusInfo(lineNumber, level);
		}

		// If no metadata available, just focus on the paragraph
		if (!this.metadata) {
			FocusPluginLogger.log('Debug', 'No metadata available for focus calculation');
			return this.getParagraphFocusInfo(lineNumber, doc);
		}

		// Check if this line belongs to a heading's content
		const headingInfo = this.findParentHeading(lineNumber);
		if (headingInfo) {
			if (this.includeBody) {
				return headingInfo;
			} else {
				// Focus only on the paragraph
				return this.getParagraphFocusInfo(lineNumber, doc);
			}
		}

		// Default: focus on the current paragraph
		return this.getParagraphFocusInfo(lineNumber, doc);
	}

	/**
	 * Get focus info for a heading and its content
	 */
	private getHeadingFocusInfo(headingLine: number, level: number): EditModeFocusInfo {
		if (!this.metadata?.headings) {
			return {
				fromLine: headingLine,
				toLine: headingLine,
				type: 'heading',
				level
			};
		}

		// Find this heading in metadata
		const headings = this.metadata.headings;
		const currentHeadingIndex = headings.findIndex(h => h.position.start.line + 1 === headingLine);
		
		if (currentHeadingIndex === -1) {
			return {
				fromLine: headingLine,
				toLine: headingLine,
				type: 'heading',
				level
			};
		}

		let toLine = headingLine;

		if (this.includeBody) {
			// Find the next heading of equal or higher level
			for (let i = currentHeadingIndex + 1; i < headings.length; i++) {
				if (headings[i].level <= level) {
					toLine = headings[i].position.start.line; // Line before next heading
					break;
				}
			}

			// If no next heading found, extend to end of document
			if (toLine === headingLine && this.metadata.sections && this.metadata.sections.length > 0) {
				const lastSection = this.metadata.sections[this.metadata.sections.length - 1];
				if (lastSection?.position?.end?.line !== undefined) {
					toLine = lastSection.position.end.line + 1;
				}
			}
		}

		return {
			fromLine: headingLine,
			toLine,
			type: 'heading',
			level
		};
	}

	/**
	 * Find the parent heading for a given line
	 */
	private findParentHeading(lineNumber: number): EditModeFocusInfo | null {
		if (!this.metadata?.headings) {
			return null;
		}

		const headings = this.metadata.headings;
		
		// Find the last heading before this line
		for (let i = headings.length - 1; i >= 0; i--) {
			const headingLine = headings[i].position.start.line + 1;
			if (headingLine < lineNumber) {
				return this.getHeadingFocusInfo(headingLine, headings[i].level);
			}
		}

		return null;
	}

	/**
	 * Get focus info for a paragraph (content between empty lines or headings)
	 */
	private getParagraphFocusInfo(lineNumber: number, doc: any): EditModeFocusInfo {
		let fromLine = lineNumber;
		let toLine = lineNumber;

		// Find paragraph start (go up until empty line, heading, or document start)
		for (let i = lineNumber - 1; i >= 1; i--) {
			const line = doc.line(i);
			const lineText = line.text.trim();
			
			// Stop at empty lines or headings
			if (lineText === '' || lineText.match(/^#{1,6}\s+/)) {
				break;
			}
			fromLine = i;
		}

		// Find paragraph end (go down until empty line, heading, or document end)
		for (let i = lineNumber + 1; i <= doc.lines; i++) {
			const line = doc.line(i);
			const lineText = line.text.trim();
			
			// Stop at empty lines or headings
			if (lineText === '' || lineText.match(/^#{1,6}\s+/)) {
				break;
			}
			toLine = i;
		}

		return {
			fromLine,
			toLine,
			type: 'paragraph'
		};
	}

	/**
	 * Apply focus to editor view
	 */
	applyFocus(view: EditorView, focusInfo: EditModeFocusInfo) {
		view.dispatch({
			effects: setFocusEffect.of(focusInfo)
		});
	}

	/**
	 * Clear focus from editor view
	 */
	clearFocus(view: EditorView) {
		view.dispatch({
			effects: clearFocusEffect.of(null)
		});
	}

	/**
	 * Check if a line is currently focused
	 */
	isLineFocused(view: EditorView, lineNumber: number): boolean {
		const focusInfo = view.state.field(focusStateField, false);
		if (!focusInfo) return false;
		return lineNumber >= focusInfo.fromLine && lineNumber <= focusInfo.toLine;
	}
}
