import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    roots: ['<rootDir>/Tests'],
    testMatch: ['**/*.test.ts', '**/*.test.js'],
    clearMocks: true,
    injectGlobals: false,
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', { useESM: true }],
    },
};

export default config;
