import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SupernoteDigestSettings,
	MainSettingsTap,
} from "./settings";

export default class SupernoteDigests extends Plugin {
	settings: SupernoteDigestSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MainSettingsTap(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SupernoteDigestSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
