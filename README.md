# Supernote Obsidian Digest

Import your [Supernote](https://supernote.com/) digest backups directly into your Obsidian vault — no manual export or PDF extraction required.

Supernote's Digest feature lets you highlight handwritten notes and export them as a backup file (`.snbak`). This plugin reads that backup and turns each highlighted digest into a note in your vault, complete with an embedded image of the original handwritten mark.

## Features

- Upload a `.snbak` backup file and automatically generate notes from your highlighted digests
- Choose how notes are organized:
    - **Atomic** — each digest becomes its own note, linked into an Atlas (map of content) for its source document
    - **Document** — all digests for a source document are collected into a single note
- Handwritten mark images are extracted from the backup and embedded next to each digest, with trailing whitespace trimmed automatically
- Re-uploading a backup only creates notes for digests that don't already exist — your existing notes are never overwritten
- Configurable vault paths for digests, images, and atlas notes

## Requirements

- Obsidian 1.5.7 or later
- Desktop only — this plugin reads the backup file directly from disk, so it isn't available on mobile
- The [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin — Atlas notes use a Dataview query to list their linked digests, so Dataview must be installed and enabled for those to render

## File access

Your Supernote backup (`.snbak`) typically lives outside your Obsidian vault — wherever you saved it after transferring it from your device. To read it, this plugin needs permission to access a file at the path you provide, outside the vault's own folder. No other files outside the vault are read or written, and nothing is sent over the network.

## Installation

Search for "Supernote Obsidian Digest" under **Settings → Community plugins**, once approved for the directory listing.

Or install manually: download `main.js` and `manifest.json` from the [latest release](https://github.com/Tboules/supernote-obsidian-digest/releases/latest) and place them in `<YourVault>/.obsidian/plugins/supernote-digests/`, then enable the plugin under **Settings → Community plugins**.

## Usage

1. On your Supernote device, create a Digest backup:
    1. Swipe down from the top of the screen and tap **Settings**.
    2. Tap **System**.
    3. Go to **Backup and Restore** and tap the menu icon.
    4. Tap **Backup**.
    5. Check the checkbox next to **Digest**.
    6. Tap **Back Up Now**.
    7. Once complete, the backup file appears in your device's Export folder — transfer it to your computer via USB, email, cloud storage, or the Browse & Access feature. It'll have a `.snbak` extension.
2. In Obsidian, open **Settings → Supernote Obsidian Digest**.
3. Under **Path to Backup File**, browse to and select your `.snbak` file.
4. Choose your preferred **Note Organization Style** — Atomic or Document. Switching this later will delete your previously generated notes, so you'll need to click **Generate** again afterward to rebuild them in the new style.
5. Optionally adjust where digests, images, and atlas notes are saved.
6. Click **Generate**. A progress bar shows how far along the import is.

You can re-run **Generate** any time you have a new backup — only new digests will produce new notes; anything already imported is left as-is.

## License

[0BSD](LICENSE)
