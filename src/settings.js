import { __awaiter } from "tslib";
import { Modal, Notice, PluginSettingTab, Setting, } from "obsidian";
import extractDigestsFromBackup from "./readBackup";
import cleanDigests from "./cleanDigests";
import { webUtils } from 'electron';
const DEFAULT_HOME_DIR = "Supernote Digests";
export const DEFAULT_SETTINGS = {
    pathToDigests: DEFAULT_HOME_DIR + "/Digests",
    pathToImages: DEFAULT_HOME_DIR + "/Images",
    pathToAtlas: DEFAULT_HOME_DIR + "/Atlas",
    pathToBackup: "",
    noteOrgStyle: "document",
};
class ConfirmSwitchModal extends Modal {
    constructor(app, onConfirm) {
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
            .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
            .addButton((btn) => btn
            .setButtonText("Switch & Delete")
            .setCta()
            .onClick(() => {
            this.close();
            this.onConfirm();
        }));
    }
    onClose() {
        this.contentEl.empty();
    }
}
export class MainSettingsTap extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setName("Configuration").setHeading();
        const noteOrgSetting = new Setting(containerEl)
            .setName("Note Organization Style")
            .setDesc("Would you like to organize your notes using the Atomic note structure where each Digest has it's own individual markdown file, or would you like to organize your notes by document where all your Digests for a document will be in a single file.");
        noteOrgSetting.controlEl.createSpan({
            text: "Atomic",
            attr: { style: "margin-left: 1rem;" },
        });
        noteOrgSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.noteOrgStyle === "document");
            toggle.toggleEl.addEventListener("click", (e) => {
                e.preventDefault();
                new ConfirmSwitchModal(this.app, () => __awaiter(this, void 0, void 0, function* () {
                    const wasDoc = this.plugin.settings.noteOrgStyle === "document";
                    toggle.setValue(wasDoc ? false : true);
                    this.plugin.settings.noteOrgStyle = wasDoc
                        ? "atomic"
                        : "document";
                    yield this.plugin.saveSettings();
                    yield cleanDigests(this.app, this.plugin);
                })).open();
            });
        });
        noteOrgSetting.controlEl.createSpan({ text: "Document" });
        new Setting(containerEl)
            .setName("Path to Digests")
            .setDesc("Where would you like your Digests saved?")
            .addText((text) => text
            .setPlaceholder("Path/To/Digests")
            .setValue(this.plugin.settings.pathToDigests)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.pathToDigests = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Path to Atlas Files / Maps of Content")
            .setDesc("These files will organize your digest into nodes that will easily tie into together in your tree view. This is especially helpful if you choose to organize your notes in the Atomic style.")
            .addText((text) => text
            .setPlaceholder("Path/To/Atlas")
            .setValue(this.plugin.settings.pathToAtlas)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.pathToAtlas = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Path to Images")
            .setDesc("Where should we save the images of your handwritten notes?")
            .addText((text) => text
            .setPlaceholder("Path/To/Images")
            .setValue(this.plugin.settings.pathToImages)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.pathToImages = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Return to Default Settings")
            .setDesc("Click to return to the default settings")
            .addButton((button) => button.setButtonText("Reset Settings").onClick(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
            yield this.plugin.saveSettings();
            this.display();
        })));
        new Setting(containerEl).setName("Action").setHeading();
        new Setting(containerEl)
            .setName("Path to Backup File")
            .setDesc("Please point us to your digests backup file. \n In order to find your backup file, on your Supernote device, go to the following: \n Settings > System > Backup and Restore > Backup > check 'Digest' > Back Up Now. \n The backup file will appear in your device's Export folder — transfer it to your computer (via USB, email, cloud storage, or the Browse & Access feature) and point us to it.")
            .addText((text) => text
            .setPlaceholder("Path/To/backup.snbak")
            .setValue(this.plugin.settings.pathToBackup)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.pathToBackup = value;
            yield this.plugin.saveSettings();
        })))
            .addButton((button) => button.setButtonText("Browse").onClick(() => {
            // we are creating an input that will get removed after it's used
            // if you don't clean it, it will live in the dom and create repeat inputs.
            const input = containerEl.createEl("input", {
                type: "file",
                attr: {
                    accept: ".snbak",
                    style: "position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0;",
                },
            });
            input.onchange = () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const file = (_a = input.files) === null || _a === void 0 ? void 0 : _a[0];
                if (!file) {
                    input.remove();
                    return;
                }
                const path = webUtils.getPathForFile(file);
                this.plugin.settings.pathToBackup = path;
                input.remove();
                this.display();
                yield this.plugin.saveSettings();
            });
            input.click();
        }));
        let progressBar;
        new Setting(containerEl)
            .setName("Generate Notes From Digests")
            .addProgressBar((bar) => {
            bar.setValue(0);
            progressBar = bar;
        })
            .addButton((button) => button.setButtonText("Generate").onClick(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const path = this.plugin.settings.pathToBackup;
                yield extractDigestsFromBackup(path, this.app, this.plugin, (value) => {
                    progressBar.setValue(value);
                });
            }
            catch (error) {
                new Notice(error.message);
            }
        })))
            .setDisabled(this.plugin.settings.pathToBackup == "");
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxFQUVOLEtBQUssRUFDTCxNQUFNLEVBQ04sZ0JBQWdCLEVBRWhCLE9BQU8sR0FDUCxNQUFNLFVBQVUsQ0FBQztBQUVsQixPQUFPLHdCQUF3QixNQUFNLGNBQWMsQ0FBQztBQUNwRCxPQUFPLFlBQVksTUFBTSxnQkFBZ0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sVUFBVSxDQUFBO0FBVW5DLE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CLENBQUM7QUFFN0MsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQTRCO0lBQ3hELGFBQWEsRUFBRSxnQkFBZ0IsR0FBRyxVQUFVO0lBQzVDLFlBQVksRUFBRSxnQkFBZ0IsR0FBRyxTQUFTO0lBQzFDLFdBQVcsRUFBRSxnQkFBZ0IsR0FBRyxRQUFRO0lBQ3hDLFlBQVksRUFBRSxFQUFFO0lBQ2hCLFlBQVksRUFBRSxVQUFVO0NBQ3hCLENBQUM7QUFFRixNQUFNLGtCQUFtQixTQUFRLEtBQUs7SUFHckMsWUFBWSxHQUFRLEVBQUUsU0FBcUI7UUFDMUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDNUIsQ0FBQztJQUVELE1BQU07UUFDTCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLENBQUMsQ0FBQztRQUN6RCxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRTtZQUN2QixJQUFJLEVBQUUsaU1BQWlNO1NBQ3ZNLENBQUMsQ0FBQztRQUVILElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQzthQUNwQixTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUNs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QUFjLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUN2QixHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLFdBQVcsR0FBRyxHQUFHLENBQUM7UUFDbkIsQ0FBQyxDQUFDO2FBQ0QsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDckIsTUFBTSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBUyxFQUFFO1lBQ25ELElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7Z0JBQy9DLE1BQU0sd0JBQXdCLENBQzdCLElBQUksRUFDSixJQUFJLENBQUMsR0FBRyxFQUNSLElBQUksQ0FBQyxNQUFNLEVBQ1gsQ0FBQyxLQUFLLEVBQUUsRUFBRTtvQkFDVCxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixDQUFDLENBQ0QsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7WUFFMUIsQ0FBQztRQUNGLENBQUMsQ0FBQSxDQUFDLENBQ0Y7YUFDQSxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG5cdEFwcCxcblx0TW9kYWwsXG5cdE5vdGljZSxcblx0UGx1Z2luU2V0dGluZ1RhYixcblx0UHJvZ3Jlc3NCYXJDb21wb25lbnQsXG5cdFNldHRpbmcsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IFN1cGVybm90ZURpZ2VzdHMgZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IGV4dHJhY3REaWdlc3RzRnJvbUJhY2t1cCBmcm9tIFwiLi9yZWFkQmFja3VwXCI7XG5pbXBvcnQgY2xlYW5EaWdlc3RzIGZyb20gXCIuL2NsZWFuRGlnZXN0c1wiO1xuaW1wb3J0IHsgd2ViVXRpbHMgfSBmcm9tICdlbGVjdHJvbidcblxuZXhwb3J0IGludGVyZmFjZSBTdXBlcm5vdGVEaWdlc3RTZXR0aW5ncyB7XG5cdHBhdGhUb0RpZ2VzdHM6IHN0cmluZztcblx0cGF0aFRvSW1hZ2VzOiBzdHJpbmc7XG5cdHBhdGhUb0F0bGFzOiBzdHJpbmc7XG5cdHBhdGhUb0JhY2t1cDogc3RyaW5nO1xuXHRub3RlT3JnU3R5bGU6IFwiYXRvbWljXCIgfCBcImRvY3VtZW50XCI7XG59XG5cbmNvbnN0IERFRkFVTFRfSE9NRV9ESVIgPSBcIlN1cGVybm90ZSBEaWdlc3RzXCI7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBTdXBlcm5vdGVEaWdlc3RTZXR0aW5ncyA9IHtcblx0cGF0aFRvRGlnZXN0czogREVGQVVMVF9IT01FX0RJUiArIFwiL0RpZ2VzdHNcIixcblx0cGF0aFRvSW1hZ2VzOiBERUZBVUxUX0hPTUVfRElSICsgXCIvSW1hZ2VzXCIsXG5cdHBhdGhUb0F0bGFzOiBERUZBVUxUX0hPTUVfRElSICsgXCIvQXRsYXNcIixcblx0cGF0aFRvQmFja3VwOiBcIlwiLFxuXHRub3RlT3JnU3R5bGU6IFwiZG9jdW1lbnRcIixcbn07XG5cbmNsYXNzIENvbmZpcm1Td2l0Y2hNb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0b25Db25maXJtOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBvbkNvbmZpcm06ICgpID0+IHZvaWQpIHtcblx0XHRzdXBlcihhcHApO1xuXHRcdHRoaXMub25Db25maXJtID0gb25Db25maXJtO1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJTd2l0Y2ggTm90ZSBTdHlsZT9cIiB9KTtcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHtcblx0XHRcdHRleHQ6IFwiU3dpdGNoaW5nIG5vdGUgb3JnYW5pemF0aW9uIHN0eWxlcyB3aWxsIGRlbGV0ZSBhbGwgcHJldmlvdXNseSBnZW5lcmF0ZWQgbm90ZXMuIFRoaXMgY2Fubm90IGJlIHVuZG9uZS4gT25seSB0aGUgbm90ZXMgd2UgZ2VuZXJhdGVkIHdpbGwgYmUgZGVsZXRlZCwgYW5kIHlvdSBjYW4gYWx3YXlzIHJlZ2VuZXJhdGUgaW4gdGhlIGZ1dHVyZS5cIixcblx0XHR9KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcblx0XHRcdC5hZGRCdXR0b24oKGJ0bikgPT5cblx0XHRcdFx0YnRuLnNldEJ1dHRvblRleHQoXCJDYW5jZWxcIikub25DbGljaygoKSA9PiB0aGlzLmNsb3NlKCkpLFxuXHRcdFx0KVxuXHRcdFx0LmFkZEJ1dHRvbigoYnRuKSA9PlxuXHRcdFx0XHRidG5cblx0XHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIlN3aXRjaCAmIERlbGV0ZVwiKVxuXHRcdFx0XHRcdC5zZXRDdGEoKVxuXHRcdFx0XHRcdC5vbkNsaWNrKCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMub25Db25maXJtKCk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYWluU2V0dGluZ3NUYXAgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcblx0cGx1Z2luOiBTdXBlcm5vdGVEaWdlc3RzO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFN1cGVybm90ZURpZ2VzdHMpIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cblx0XHRjb250YWluZXJFbC5lbXB0eSgpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJDb25maWd1cmF0aW9uXCIpLnNldEhlYWRpbmcoKTtcblxuXHRcdGNvbnN0IG5vdGVPcmdTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIk5vdGUgT3JnYW5pemF0aW9uIFN0eWxlXCIpXG5cdFx0XHQuc2V0RGVzYyhcblx0XHRcdFx0XCJXb3VsZCB5b3UgbGlrZSB0byBvcmdhbml6ZSB5b3VyIG5vdGVzIHVzaW5nIHRoZSBBdG9taWMgbm90ZSBzdHJ1Y3R1cmUgd2hlcmUgZWFjaCBEaWdlc3QgaGFzIGl0J3Mgb3duIGluZGl2aWR1YWwgbWFya2Rvd24gZmlsZSwgb3Igd291bGQgeW91IGxpa2UgdG8gb3JnYW5pemUgeW91ciBub3RlcyBieSBkb2N1bWVudCB3aGVyZSBhbGwgeW91ciBEaWdlc3RzIGZvciBhIGRvY3VtZW50IHdpbGwgYmUgaW4gYSBzaW5nbGUgZmlsZS5cIixcblx0XHRcdCk7XG5cblx0XHRub3RlT3JnU2V0dGluZy5jb250cm9sRWwuY3JlYXRlU3Bhbih7XG5cdFx0XHR0ZXh0OiBcIkF0b21pY1wiLFxuXHRcdFx0YXR0cjogeyBzdHlsZTogXCJtYXJnaW4tbGVmdDogMXJlbTtcIiB9LFxuXHRcdH0pO1xuXG5cdFx0bm90ZU9yZ1NldHRpbmcuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcblx0XHRcdHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlT3JnU3R5bGUgPT09IFwiZG9jdW1lbnRcIik7XG5cdFx0XHR0b2dnbGUudG9nZ2xlRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0bmV3IENvbmZpcm1Td2l0Y2hNb2RhbCh0aGlzLmFwcCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdhc0RvYyA9XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlT3JnU3R5bGUgPT09IFwiZG9jdW1lbnRcIjtcblx0XHRcdFx0XHR0b2dnbGUuc2V0VmFsdWUod2FzRG9jID8gZmFsc2UgOiB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlT3JnU3R5bGUgPSB3YXNEb2Ncblx0XHRcdFx0XHRcdD8gXCJhdG9taWNcIlxuXHRcdFx0XHRcdFx0OiBcImRvY3VtZW50XCI7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0YXdhaXQgY2xlYW5EaWdlc3RzKHRoaXMuYXBwLCB0aGlzLnBsdWdpbik7XG5cdFx0XHRcdH0pLm9wZW4oKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0bm90ZU9yZ1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIkRvY3VtZW50XCIgfSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiUGF0aCB0byBEaWdlc3RzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXJlIHdvdWxkIHlvdSBsaWtlIHlvdXIgRGlnZXN0cyBzYXZlZD9cIilcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiUGF0aC9Uby9EaWdlc3RzXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhdGhUb0RpZ2VzdHMpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aFRvRGlnZXN0cyA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlBhdGggdG8gQXRsYXMgRmlsZXMgLyBNYXBzIG9mIENvbnRlbnRcIilcblx0XHRcdC5zZXREZXNjKFxuXHRcdFx0XHRcIlRoZXNlIGZpbGVzIHdpbGwgb3JnYW5pemUgeW91ciBkaWdlc3QgaW50byBub2RlcyB0aGF0IHdpbGwgZWFzaWx5IHRpZSBpbnRvIHRvZ2V0aGVyIGluIHlvdXIgdHJlZSB2aWV3LiBUaGlzIGlzIGVzcGVjaWFsbHkgaGVscGZ1bCBpZiB5b3UgY2hvb3NlIHRvIG9yZ2FuaXplIHlvdXIgbm90ZXMgaW4gdGhlIEF0b21pYyBzdHlsZS5cIixcblx0XHRcdClcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiUGF0aC9Uby9BdGxhc1wiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXRoVG9BdGxhcylcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXRoVG9BdGxhcyA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlBhdGggdG8gSW1hZ2VzXCIpXG5cdFx0XHQuc2V0RGVzYyhcblx0XHRcdFx0XCJXaGVyZSBzaG91bGQgd2Ugc2F2ZSB0aGUgaW1hZ2VzIG9mIHlvdXIgaGFuZHdyaXR0ZW4gbm90ZXM/XCIsXG5cdFx0XHQpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIlBhdGgvVG8vSW1hZ2VzXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhdGhUb0ltYWdlcylcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXRoVG9JbWFnZXMgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJSZXR1cm4gdG8gRGVmYXVsdCBTZXR0aW5nc1wiKVxuXHRcdFx0LnNldERlc2MoXCJDbGljayB0byByZXR1cm4gdG8gdGhlIGRlZmF1bHQgc2V0dGluZ3NcIilcblx0XHRcdC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cblx0XHRcdFx0YnV0dG9uLnNldEJ1dHRvblRleHQoXCJSZXNldCBTZXR0aW5nc1wiKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHtcblx0XHRcdFx0XHRcdC4uLkRFRkFVTFRfU0VUVElOR1MsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR0aGlzLmRpc3BsYXkoKTtcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJBY3Rpb25cIikuc2V0SGVhZGluZygpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlBhdGggdG8gQmFja3VwIEZpbGVcIilcblx0XHRcdC5zZXREZXNjKFxuXHRcdFx0XHRcIlBsZWFzZSBwb2ludCB1cyB0byB5b3VyIGRpZ2VzdHMgYmFja3VwIGZpbGUuIFxcbiBJbiBvcmRlciB0byBmaW5kIHlvdXIgYmFja3VwIGZpbGUsIG9uIHlvdXIgU3VwZXJub3RlIGRldmljZSwgZ28gdG8gdGhlIGZvbGxvd2luZzogXFxuIFNldHRpbmdzID4gU3lzdGVtID4gQmFja3VwIGFuZCBSZXN0b3JlID4gQmFja3VwID4gY2hlY2sgJ0RpZ2VzdCcgPiBCYWNrIFVwIE5vdy4gXFxuIFRoZSBiYWNrdXAgZmlsZSB3aWxsIGFwcGVhciBpbiB5b3VyIGRldmljZSdzIEV4cG9ydCBmb2xkZXIg4oCUIHRyYW5zZmVyIGl0IHRvIHlvdXIgY29tcHV0ZXIgKHZpYSBVU0IsIGVtYWlsLCBjbG91ZCBzdG9yYWdlLCBvciB0aGUgQnJvd3NlICYgQWNjZXNzIGZlYXR1cmUpIGFuZCBwb2ludCB1cyB0byBpdC5cIixcblx0XHRcdClcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiUGF0aC9Uby9iYWNrdXAuc25iYWtcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aFRvQmFja3VwKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnBhdGhUb0JhY2t1cCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHQpXG5cdFx0XHQuYWRkQnV0dG9uKChidXR0b24pID0+XG5cdFx0XHRcdGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiQnJvd3NlXCIpLm9uQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHdlIGFyZSBjcmVhdGluZyBhbiBpbnB1dCB0aGF0IHdpbGwgZ2V0IHJlbW92ZWQgYWZ0ZXIgaXQncyB1c2VkXG5cdFx0XHRcdFx0Ly8gaWYgeW91IGRvbid0IGNsZWFuIGl0LCBpdCB3aWxsIGxpdmUgaW4gdGhlIGRvbSBhbmQgY3JlYXRlIHJlcGVhdCBpbnB1dHMuXG5cdFx0XHRcdFx0Y29uc3QgaW5wdXQgPSBjb250YWluZXJFbC5jcmVhdGVFbChcImlucHV0XCIsIHtcblx0XHRcdFx0XHRcdHR5cGU6IFwiZmlsZVwiLFxuXHRcdFx0XHRcdFx0YXR0cjoge1xuXHRcdFx0XHRcdFx0XHRhY2NlcHQ6IFwiLnNuYmFrXCIsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDFweDsgaGVpZ2h0OiAxcHg7IG92ZXJmbG93OiBoaWRkZW47IG9wYWNpdHk6IDA7XCIsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlucHV0Lm9uY2hhbmdlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZSA9IGlucHV0LmZpbGVzPy5bMF07XG5cdFx0XHRcdFx0XHRpZiAoIWZpbGUpIHtcblx0XHRcdFx0XHRcdFx0aW5wdXQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcGF0aCA9IHdlYlV0aWxzLmdldFBhdGhGb3JGaWxlKGZpbGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aFRvQmFja3VwID0gcGF0aDtcblxuXHRcdFx0XHRcdFx0aW5wdXQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmRpc3BsYXkoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aW5wdXQuY2xpY2soKTtcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0bGV0IHByb2dyZXNzQmFyOiBQcm9ncmVzc0JhckNvbXBvbmVudDtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJHZW5lcmF0ZSBOb3RlcyBGcm9tIERpZ2VzdHNcIilcblx0XHRcdC5hZGRQcm9ncmVzc0JhcigoYmFyKSA9PiB7XG5cdFx0XHRcdGJhci5zZXRWYWx1ZSgwKTtcblx0XHRcdFx0cHJvZ3Jlc3NCYXIgPSBiYXI7XG5cdFx0XHR9KVxuXHRcdFx0LmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuXHRcdFx0XHRidXR0b24uc2V0QnV0dG9uVGV4dChcIkdlbmVyYXRlXCIpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aFRvQmFja3VwO1xuXHRcdFx0XHRcdFx0YXdhaXQgZXh0cmFjdERpZ2VzdHNGcm9tQmFja3VwKFxuXHRcdFx0XHRcdFx0XHRwYXRoLFxuXHRcdFx0XHRcdFx0XHR0aGlzLmFwcCxcblx0XHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4sXG5cdFx0XHRcdFx0XHRcdCh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHByb2dyZXNzQmFyLnNldFZhbHVlKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoZXJyb3IubWVzc2FnZSlcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHQpXG5cdFx0XHQuc2V0RGlzYWJsZWQodGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aFRvQmFja3VwID09IFwiXCIpO1xuXHR9XG59XG4iXX0=