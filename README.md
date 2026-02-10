# Focus and Highlight
A plugin for [obsidian](https://obsidian.md/) to focus on a specific paragraph in both [Reading mode and Edit mode](https://help.obsidian.md/How+to/Read+and+edit+modes).

## Features
- **Works in both Reading (Preview) mode and Edit (Source) mode!**
- Focus on a specific heading and its children when clicking on them.
    - Start from v1.2.0. You can also focus on a specific paragraph by changing the setting `Content Behavior` to `Only Focus the Element`.
    - Start from v1.2.0. You can focus by clicking the children of a heading.
	- If you don't want to change your focus state when selecting the text, you can make the value of `Focus Sensitivity` smaller.
- **New in v1.4.0**: Full support for Edit mode with smooth transitions and intelligent heading detection.

![](demo.gif)

## Usage
1. The plugin is now available in the community plugins list! You can download the plugin directly through Obsidian's `Settings > Community plugins` Tab.
    - You can also install with [BRAT](https://github.com/TfTHacker/obsidian42-brat), with the repository name `nagi1999a/obsidian-focus-plugin`.
2. Enable the plugin named `Focus and Highlight` in Obsidian's `Settings > Community plugins` Tab.

Once the plugin is installed and enabled, you can focus on different headings by clicking on any of them.

## Options
You can adjust the behavior of this plugin by accessing Obsidian's `Settings > Focus and Highlight` Tab.

### Clear Method
This option affects the way to clear the focus state.

#### Click Again
Clear the focus state by clicking again on the focused heading.

#### Click Outside
Clear the focus state by clicking on the blank area at the left or right side of the reading area, which may not work correctly when `Settings > Editor > Readable line length` is turned off.

### Focus Scope
This option affects the scope of the focus state.

#### Only One Block
Focus only on the block you clicked on.

#### Also the Content
Focus on the block you clicked on and related content.

### Content Behavior
This option affects the behavior when clicking on the content elements, e.g. pure text, and callout block.

#### Only Focus on the Element
Focus only on the element you clicked on.

#### Focus Related Contents
Focus on the element you clicked on and related content.

### Enable List
Focus on the list item (experimental, only works on the first level list)

### Focus Sensitivity
Focus only when the mouse is 'not' still for a while (larger means longer).

### Style Settings
With the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin installed and enabled, you can further customize some visual properties under `Settings > Style Settings > Focus and Highlight`.

#### Dim Opacity
Set the opacity of dimmed elements. Default is 0.1.

#### Dim Speed
Set the speed of the animation in seconds. Default is 0.5.

## Discussion

### Behavior under Multiple Panes
The plugin now supports multi-pane scenarios. Different panes will be able to focus on their headings, as the following GIF shows.

![](multi_pane.gif)

### Edit Mode Support (v1.4.0+)

The plugin now fully supports Edit (Source) mode! When you click on a line in edit mode:
- Clicking on a heading will focus the heading and its content (based on your Focus Scope settings)
- Clicking on regular text will focus the current paragraph or its parent heading's content
- The dimming effect uses the same opacity and animation speed settings as Preview mode
- Focus state is automatically cleared when switching between Edit and Preview modes

### Technical Details

Edit mode support is implemented using CodeMirror 6 extensions:
- **State fields** track the current focus state
- **Decorations** apply visual dimming to unfocused lines
- **Metadata cache** determines heading hierarchy and content boundaries

### Issues
If you encounter any problems or have suggestions about the plugin, please feel free to open issues.

### Support
> [!NOTE] Maintaining a plugin is not an easy task.
> If you like this plugin, please consider the following methods to support the author:
> 1. Please give me a star!
> 2. [Buy me a coffee](https://www.buymeacoffee.com/nagi1999a)!