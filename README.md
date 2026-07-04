# Markdown Viewer for macOS

Markdown Viewer is a lightweight macOS desktop app for **reading local Markdown files**.
It is intentionally **view-only**: no editor, no workspace manager, no sync layer.

## What this app is for

Use it when you want:

- a simple preview window beside your editor
- a readable GitHub-like presentation for local notes
- support for math, code blocks, tables, and task lists
- custom themes without building a full editor
- export a singe-page PDF

Use another tool if you need:

- Markdown editing
- multi-tab note management
- search across many documents
- printing

## Installation

### Option 1: Run from source

Requirements:

- Node.js
- Rust
- macOS

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run tauri dev
```

### Option 2: Build a local app bundle

Build the macOS app and DMG:

```bash
CI=false npm run tauri build -- --debug
```

Generated outputs:

- App bundle: `src-tauri/target/debug/bundle/macos/Markdown Viewer.app`
- DMG: `src-tauri/target/debug/bundle/dmg/Markdown Viewer_0.1.0_aarch64.dmg`

You can open the `.app` directly or mount the DMG and install from there.

### Option 3: Install with Homebrew Cask

Assuming:

- the app releases are published at `ryokbys/markdown-viewer`
- the tap repository is published at `ryokbys/homebrew-markdown-viewer`

Users can install with:

```bash
brew tap ryokbys/markdown-viewer
brew install --cask ryokbys/markdown-viewer/markdown-viewer
```

This installs:

- the GUI app: `Markdown Viewer`
- the CLI launcher: `mdv`

Example:

```bash
mdv hoge.md
```

## Basic usage

### Open a Markdown file

You can open a local `.md` file by:

- clicking **Open…**
- dragging a file onto the window
- opening an associated `.md` file from Finder

### Navigate documents

- Relative links to other Markdown files open in the same window
- `#anchor` links jump to headings inside the current document
- External `http://` and `https://` links open in your default browser

### Live preview workflow

Open a Markdown file in this app, then edit the same file in another editor.
When the file changes on disk, the viewer reloads automatically and tries to preserve scroll position.

### Change the reading view

You can adjust:

- theme
- font size
- text width

These settings are stored in the app config and reused the next time you launch the app.

### Export a PDF

Click **Export PDF** in the top-right toolbar.
The app asks you where to save the file, then exports the current document using the **currently selected theme**, font size, and text width.

## Custom themes

User themes are plain CSS files.

Theme directory:

```text
~/Library/Application Support/com.ryokbys.markdownviewer/themes/
```

Drop `.css` files into that directory and the app will detect them automatically.
Themes are applied to the rendered Markdown area only, not to the whole application UI.

Sample themes are available in:

```text
samples/themes/
```

## Sample files

This repository includes sample content for manual testing:

- `samples/demo.md`
- `samples/linked.md`
- `samples/assets/sample-diagram.svg`
- `samples/manual-checklist.md`

Open `samples/demo.md` first if you want a quick end-to-end check.
