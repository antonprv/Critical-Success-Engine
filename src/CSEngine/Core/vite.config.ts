import { defineConfig, type Plugin } from "vite";
import {
    existsSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

function TemporaryIndexHtmlPlugin(): Plugin {
    const RootDirectory = process.cwd();

    const TemplatePath = resolve(
        RootDirectory,
        "public",
        "index.html"
    );

    const GeneratedPath = resolve(
        RootDirectory,
        "index.html"
    );

    const ScriptBlock =
        `<script type="module" src="/source/app.ts"></script>`;

    let Generated = false;
    let CleanupRegistered = false;

    function CreateIndexHtml(): void {
        if (Generated) {
            return;
        }

        if (!existsSync(TemplatePath)) {
            throw new Error(
                `Index template not found: ${TemplatePath}`
            );
        }

        const Template = readFileSync(
            TemplatePath,
            "utf8"
        );

        writeFileSync(
            GeneratedPath,
            Template.replace(
                "</body>",
                `${ScriptBlock}</body>`
            ),
            "utf8"
        );

        Generated = true;
    }

    function RemoveIndexHtml(): void {
        if (!Generated) {
            return;
        }

        if (existsSync(GeneratedPath)) {
            unlinkSync(GeneratedPath);
        }

        Generated = false;
    }

    function RegisterCleanup(): void {
        if (CleanupRegistered) {
            return;
        }

        CleanupRegistered = true;

        process.once("exit", RemoveIndexHtml);

        process.once("SIGINT", () => {
            RemoveIndexHtml();
            process.exit(130);
        });

        process.once("SIGTERM", () => {
            RemoveIndexHtml();
            process.exit(143);
        });
    }

    return {
        name: "temporary-index-html",

        configureServer(Server) {
            CreateIndexHtml();
            RegisterCleanup();

            Server.httpServer?.once(
                "close",
                RemoveIndexHtml
            );
        },

        closeBundle() {
            RemoveIndexHtml();
        },
    };
}

export default defineConfig({
    define: {
        __DEV__: "true",
    },

    plugins: [
        TemporaryIndexHtmlPlugin(),
    ],

    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,

        watch: {
            ignored: [
                "**/.vs/**",
                "**/.git/**",
                "**/node_modules/**",
                "**/dist/**",
            ],
        },
    },
});