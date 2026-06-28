import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/../tsconfig.json',
    }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ecomdash/database$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@ecomdash/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@prisma/client$': '<rootDir>/../../../packages/database/node_modules/@prisma/client/.prisma/client/default.d.ts',
  },
};

export default config;
