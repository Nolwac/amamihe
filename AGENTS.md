# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React interface and Babylon.js scenes; `server/` contains the Fastify API, storage adapter, schema, and local tev1 decision adapter. `tests/` holds Node and Playwright checks. Runtime assets belong in `public/assets/`. Group utilities under `scripts/assets/`, `scripts/browser/`, `scripts/models/`, or `scripts/deploy/`. Supporting documentation lives in `docs/`; concept scenes in `docs/design/previews/`; verification reports and screenshots in `evidence/reports/` and `evidence/screenshots/`. Host configuration belongs in `deploy/shared/` or `deploy/vps/`. Local PGlite data belongs in ignored `.data/`.

## Build, Test, and Development Commands

Use Node.js 24. Run `npm ci`, then `npm run build` and `npm start`; the application and API share port 3000. For development, run `npm run dev:api` and `npm run dev` in separate terminals.

Run `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run test:browser` for relevant changes. `npm run audit:browser` measures rendering and resource use. Chromium prerequisites are documented in `README.md`. Inspect `git status --short`, `git diff --check`, and `git diff`; review untracked files separately.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and Prettier (`npm run format`). Name React components in PascalCase and functions/variables in camelCase. Keep changes focused. Record third-party asset provenance in `docs/assets/ASSETS.md`; rebuild Low derivatives after changing their source meshes.

## Testing Guidelines

Use `*.test.ts` for Node policy, storage, and asset checks; use `browser.spec.ts` for Playwright journeys. No coverage threshold is configured. Test learner-progress, reward, security, and rendering regressions through observable behavior. External-storage tests require a disposable `TEST_DATABASE_URL`; report skips explicitly. Distinguish software-browser audits from physical-device validation.

## Commit & Pull Request Guidelines

Use short imperative subjects, following the existing history, such as `Fix checkpoint recovery`. Explain behavior, purpose, and verification in pull requests; link related issues and include actual browser captures for visible changes. Document dependencies and configuration requirements.

## Product and Configuration Rules

Follow `RULES.md`: preserve genuine 3D, predefined tutor content, chunk evidence, and post-clearance assessment. Use actual local tev1 inference for routing and selection; preserve pending decisions on failure. Keep practice points separate from mastery. Never commit secrets or expose them through `VITE_*`. Production requires TLS-verified external PostgreSQL; local development defaults to PGlite. Use placeholder environment examples and keep private configuration outside Git. Node/browser integration checks require the verified model and a running Ollama 0.35+ service.
