import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	ProgressBarComponent,
	Setting,
} from "obsidian";
import SupernoteDigests from "./main";
import extractDigestsFromBackup from "./readBackup";
import cleanDigests from "./cleanDigests";
import { webUtils } from 'electron'

export interface SupernoteDigestSettings {
	pathToDigests: string;
	pathToImages: string;
	pathToAtlas: string;
	pathToBackup: string;
	noteOrgStyle: "atomic" | "document";
}

// Resolving the absolute path of a file chosen via <input type="file"> differs
// by Electron version and context. `webUtils.getPathForFile` is the modern API
// (Electron 29+), but it isn't reliably exposed in every Obsidian renderer
// build, so we feature-detect it and fall back to the legacy `File.path`
// property when it's missing.
function getPathForFile(file: File): string {
	if (webUtils?.getPathForFile) {
		return webUtils.getPathForFile(file);
	}
	return (file as File & { path?: string }).path ?? "";
}

const DEFAULT_HOME_DIR = "Supernote Digests";

export const DEFAULT_SETTINGS: SupernoteDigestSettings = {
	pathToDigests: DEFAULT_HOME_DIR + "/Digests",
	pathToImages: DEFAULT_HOME_DIR + "/Images",
	pathToAtlas: DEFAULT_HOME_DIR + "/Atlas",
	pathToBackup: "",
	noteOrgStyle: "document",
};

class ConfirmSwitchModal extends Modal {
	onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Switch Note Style?" });
		contentEl.createEl("p", {
			text: "Switching note organization styles will delete all previously generated notes. This cannot be undone. Only the notes we generated will be deleted, and you can always regenerate in the future.",
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Switch & Delete")
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class MainSettingsTap extends PluginSettingTab {
	plugin: SupernoteDigests;

	constructor(app: App, plugin: SupernoteDigests) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Configuration").setHeading();

		const noteOrgSetting = new Setting(containerEl)
			.setName("Note Organization Style")
			.setDesc(
				"Would you like to organize your notes using the Atomic note structure where each Digest has it's own individual markdown file, or would you like to organize your notes by document where all your Digests for a document will be in a single file.",
			);

		noteOrgSetting.controlEl.createSpan({
			text: "Atomic",
			attr: { style: "margin-left: 1rem;" },
		});

		noteOrgSetting.addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.noteOrgStyle === "document");
			toggle.toggleEl.addEventListener("click", (e) => {
				e.preventDefault();
				new ConfirmSwitchModal(this.app, async () => {
					const wasDoc =
						this.plugin.settings.noteOrgStyle === "document";
					toggle.setValue(wasDoc ? false : true);
					this.plugin.settings.noteOrgStyle = wasDoc
						? "atomic"
						: "document";
					await this.plugin.saveSettings();
					await cleanDigests(this.app, this.plugin);
				}).open();
			});
		});

		noteOrgSetting.controlEl.createSpan({ text: "Document" });

		new Setting(containerEl)
			.setName("Path to Digests")
			.setDesc("Where would you like your Digests saved?")
			.addText((text) =>
				text
					.setPlaceholder("Path/To/Digests")
					.setValue(this.plugin.settings.pathToDigests)
					.onChange(async (value) => {
						this.plugin.settings.pathToDigests = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Path to Atlas Files / Maps of Content")
			.setDesc(
				"These files will organize your digest into nodes that will easily tie into together in your tree view. This is especially helpful if you choose to organize your notes in the Atomic style.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Path/To/Atlas")
					.setValue(this.plugin.settings.pathToAtlas)
					.onChange(async (value) => {
						this.plugin.settings.pathToAtlas = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Path to Images")
			.setDesc(
				"Where should we save the images of your handwritten notes?",
			)
			.addText((text) =>
				text
					.setPlaceholder("Path/To/Images")
					.setValue(this.plugin.settings.pathToImages)
					.onChange(async (value) => {
						this.plugin.settings.pathToImages = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Return to Default Settings")
			.setDesc("Click to return to the default settings")
			.addButton((button) =>
				button.setButtonText("Reset Settings").onClick(async () => {
					this.plugin.settings = {
						...DEFAULT_SETTINGS,
					};
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl).setName("Action").setHeading();

		new Setting(containerEl)
			.setName("Path to Backup File")
			.setDesc(
				"Please point us to your digests backup file. \n In order to find your backup file, on your Supernote device, go to the following: \n Settings > System > Backup and Restore > Backup > check 'Digest' > Back Up Now. \n The backup file will appear in your device's Export folder — transfer it to your computer (via USB, email, cloud storage, or the Browse & Access feature) and point us to it.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Path/To/backup.snbak")
					.setValue(this.plugin.settings.pathToBackup)
					.onChange(async (value) => {
						this.plugin.settings.pathToBackup = value;
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Browse").onClick(() => {
					// we are creating an input that will get removed after it's used
					// if you don't clean it, it will live in the dom and create repeat inputs.
					const input = containerEl.createEl("input", {
						type: "file",
						attr: {
							accept: ".snbak",
							style: "position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0;",
						},
					});
					input.onchange = async () => {
						const file = input.files?.[0];
						if (!file) {
							input.remove();
							return;
						}

						const path = getPathForFile(file)
						if (path == "") {
							// never fail silently — the text field is a manual
							// fallback that works on every platform
							new Notice(
								"Couldn't determine the file's location automatically. Please type the full path to your backup file into the text field instead.",
							);
							input.remove();
							return;
						}
						this.plugin.settings.pathToBackup = path;

						input.remove();
						this.display();
						await this.plugin.saveSettings();
					};
					input.click();
				}),
			);

		let progressBar: ProgressBarComponent;

		new Setting(containerEl)
			.setName("Generate Notes From Digests")
			.addProgressBar((bar) => {
				bar.setValue(0);
				progressBar = bar;
			})
			.addButton((button) =>
				button.setButtonText("Generate").onClick(async () => {
					// tolerate paths pasted with surrounding quotes (e.g. from
					// Windows' "Copy as path") or stray whitespace
					const path = this.plugin.settings.pathToBackup
						.trim()
						.replace(/^"(.*)"$/, "$1")
						.replace(/^'(.*)'$/, "$1");
					if (path == "") {
						new Notice("Please select a backup file before generating.");
						return;
					}

					try {
						await extractDigestsFromBackup(
							path,
							this.app,
							this.plugin,
							(value) => {
								progressBar.setValue(value);
							},
						);
					} catch (error) {
						if (error instanceof Error) {
							new Notice(error.message)
						} else {
							new Notice("Something went wrong while generating the Digests.")
						}

					}
				}),
			);
	}
}
