import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server/tests'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverageFrom: ['server/src/**/*.ts', '!server/src/index.ts'],
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts']
};

export default config;
