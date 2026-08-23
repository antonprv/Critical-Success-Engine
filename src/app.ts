import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";

import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    MeshBuilder
} from "@babylonjs/core";

class App {
    constructor() {
        // Create the canvas HTML element and attach it to the webpage.
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);

        // Initialize Babylon scene and engine.
        const engine = new Engine(canvas, true);
        const scene = new Scene(engine);

        const camera = new ArcRotateCamera(
            "Camera",
            Math.PI / 2,
            Math.PI / 2,
            2,
            Vector3.Zero(),
            scene
        );

        camera.attachControl(canvas, true);

        const light = new HemisphericLight(
            "light1",
            new Vector3(1, 1, 0),
            scene
        );

        const sphere = MeshBuilder.CreateSphere(
            "sphere",
            { diameter: 1 },
            scene
        );

        // Hide/show the Inspector.
        window.addEventListener("keydown", (event) => {
            // Shift+Ctrl+Alt+I
            if (
                event.shiftKey &&
                event.ctrlKey &&
                event.altKey &&
                (event.key === "I" || event.key === "i")
            ) {
                if (scene.debugLayer.isVisible()) {
                    scene.debugLayer.hide();
                } else {
                    scene.debugLayer.show();
                }
            }
        });

        // Run the main render loop.
        engine.runRenderLoop(() => {
            scene.render();
        });
    }
}

new App();