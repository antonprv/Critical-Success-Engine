import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["node_modules/**", "coverage/**", ".e2e/**", "test-results/**", "playwright-report/**"],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
        rules: {
            // Add project-specific rule overrides here.
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    }
);
