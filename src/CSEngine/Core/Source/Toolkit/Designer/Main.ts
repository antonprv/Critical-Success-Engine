// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createApp } from "vue";
import LoginDialog from "./Examples/LoginDialog.ui.json?raw";
import { ExampleScripts } from "./Examples/LoginDialog";
import { ParseLayout } from "./Layout";
import WinDesigner from "./WinDesigner.vue";

createApp(WinDesigner, { layout: ParseLayout(LoginDialog), scripts: ExampleScripts() }).mount(document.getElementById("designer")!);
