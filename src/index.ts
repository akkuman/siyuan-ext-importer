import {
    Plugin,
    showMessage,
    confirm,
    Dialog,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    getBackend,
    IModel,
    Protyle,
    openWindow,
    IOperation,
    Constants,
    openMobileFileById,
    lockScreen,
    ICard,
    ICardData
} from "siyuan";
import "@/index.scss";

import ImportForm from "@/ImportForm.svelte"

import { svelteDialog } from "./libs/dialog";


export default class PluginSample extends Plugin {

    async onload() {
        // 图标的制作参见帮助文档
        this.addIcons(`
<symbol id="iconCYImportLine" viewBox="0 0 36 36">
  <path d="M28 4H14.87L8 10.86V15h2v-1.39h7.61V6H28v24H8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-12 8h-6v-.32L15.7 6h.3Z" class="clr-i-outline clr-i-outline-path-1"/>
  <path d="M11.94 26.28a1 1 0 1 0 1.41 1.41L19 22l-5.68-5.68a1 1 0 0 0-1.41 1.41L15.2 21H3a1 1 0 1 0 0 2h12.23Z" class="clr-i-outline clr-i-outline-path-2"/>
  <path fill="none" d="M0 0h36v36H0z"/>
</symbol>
`);

        this.addTopBar({
            icon: "iconCYImportLine",
            title: this.i18n.addTopBarIcon,
            position: "right",
            callback: () => {
                this.showDialog()
            }
        });

        console.log(this.i18n.helloPlugin);
    }

    async onunload() {
        console.log(this.i18n.byePlugin);
    }

    async updateCards(options: ICardData) {
        options.cards.sort((a: ICard, b: ICard) => {
            if (a.blockID < b.blockID) {
                return -1;
            }
            if (a.blockID > b.blockID) {
                return 1;
            }
            return 0;
        });
        return options;
    }

    private showDialog() {
        // let dialog = new Dialog({
        //     title: `SiYuan ${Constants.SIYUAN_VERSION}`,
        //     content: `<div id="helloPanel" class="b3-dialog__content"></div>`,
        //     width: this.isMobile ? "92vw" : "720px",
        //     destroyCallback() {
        //         // hello.$destroy();
        //     },
        // });
        // new HelloExample({
        //     target: dialog.element.querySelector("#helloPanel"),
        //     props: {
        //         app: this.app,
        //     }
        // });
        svelteDialog({
            title: this.i18n.dialogTitle,
            width: "720px",
            constructor: (container: HTMLElement) => {
                return new ImportForm({
                    target: container,
                    props: {
                        pluginInstance: this,
                    }
                });
            }
        });
    }
}
