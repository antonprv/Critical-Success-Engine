import { defineConfig } from "vite";

export default defineConfig({
    define: {
        __DEV__: "true",
    },

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