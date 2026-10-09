# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React interface and Babylon.js scenes. `server/` contains the Fastify API, storage adapter, schema, and mock classifier. `tests/` holds Node and Playwright checks. `public/assets/` contains game meshes, textures, and avatar thumbnails; `scripts/` provides asset builders, capture/audit tools, and hosting helpers. Use `previews/` for scene references and `evidence/` for measured browser results. Architecture, product rules, delivery status, and hosting instructions live in root Markdown files. Local PGlite data belongs in ignored `.data/`.

## Build, Test, and Development Commands

Use Node.js 24. Run `npm ci`, then `npm run build` and `npm start`; the application and API share port 3000. For development, run `npm run dev:api` and `npm run dev` in separate terminals.

Run `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run test:browser` for relevant changes. `npm run audit:browser` measures rendering and resource use. Chromium prerequisites are documented in `README.md`. Inspect `git status --short`, `git diff --check`, and `git diff`; review untracked files separately.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and Prettier (`npm run format`). Name React components in PascalCase and functions/variables in camelCase. Keep changes focused. Record third-party asset provenance in `ASSETS.md`; rebuild Low derivatives after changing their source meshes.

## Testing Guidelines

Use `*.test.ts` for Node policy, storage, and asset checks; use `browser.spec.ts` for Playwright journeys. No coverage threshold is configured. Test learner-progress, reward, security, and rendering regressions through observable behavior. External-storage tests require a disposable `TEST_DATABASE_URL`; report skips explicitly. Distinguish software-browser audits from physical-device validation.

## Commit & Pull Request Guidelines

No existing commit history establishes a convention. Use short imperative subjects, such as `Fix checkpoint recovery`. Explain behavior, purpose, and verification in pull requests; link related issues and include actual browser captures for visible changes. Document dependencies and configuration requirements.

## Product and Configuration Rules

Follow `RULES.md`: preserve genuine 3D, predefined tutor content, chunk evidence, and post-clearance routing. Keep mock decisions clearly labeled and practice points separate from mastery. Never commit secrets or expose them through `VITE_*`. Production requires TLS-verified external PostgreSQL; local development defaults to PGlite. Use placeholder environment examples and keep private configuration outside Git.
