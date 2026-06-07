import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import readBackup from "readBackup";

export interface MyPluginSettings {
	pathToDigests: string;
	pathToBackup: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	pathToDigests: "add a suggested path here",
	pathToBackup: "add a suggested path here",
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Digests Folder")
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
					readBackup(path, this.app, this.plugin);
				}),
			);
	}
}
