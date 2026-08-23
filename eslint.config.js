const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            // Add project-specific rule overrides here.
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    }
);
