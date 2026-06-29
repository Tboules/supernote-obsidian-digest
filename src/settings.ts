import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import extractDigestsFromBackup from "./readBackup";

export interface MyPluginSettings {
	pathToDigests: string;
	pathToImages: string;
	pathToBackup: string;
	noteOrgStyle: "atomic" | "document";
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	pathToDigests: "SN/Digests",
	pathToImages: "SN/Images",
	pathToBackup: "add a suggested path here",
	noteOrgStyle: "document",
};

export class MainSettingsTap extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

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
			return toggle
				.setValue(this.plugin.settings.noteOrgStyle === "document")
				.onChange(async (value) => {
					this.plugin.settings.noteOrgStyle = value
						? "document"
						: "atomic";

					await this.plugin.saveSettings();
				});
		});

		noteOrgSetting.controlEl.createSpan({ text: "Document" });

		new Setting(containerEl)
			.setName("Path to Backup File")
			.setDesc("Please point us to your digests backup file.")
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
					const input = document.createElement("input");
					input.type = "file";
					input.accept = ".snbak";
					input.onchange = async () => {
						const file = input.files?.[0];
						if (!file) return;

						const path = (file as any).path;
						this.plugin.settings.pathToBackup = path;

						this.display();
						await this.plugin.saveSettings();
					};
					input.click();
				}),
			);

		new Setting(containerEl)
			.setName("Generate Notes From Digests")
			.setDesc(
				"Click once you have your backup file ready and we will create Notes based on your digests.",
			)
			.addButton((button) =>
				button.setButtonText("Generate").onClick(() => {
					const path = this.plugin.settings.pathToBackup;
					extractDigestsFromBackup(path, this.app, this.plugin);
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
	}
}
