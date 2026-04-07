# Contributing to simplicity-db

Thanks for your interest. This library is a thin wrapper around `pg.Pool` — it reads `DATABASE_URL` from the environment and exports a small handful of helpers. Contributions should preserve that minimalism.

## Guiding principles

- **Stay thin over `pg`.** The published package should not reinvent what `pg` already does. If a feature belongs in `pg`, send it there.
- **Don't grow the API.** If a change adds a new export, configuration option, or import path, open an issue first to discuss whether it belongs here or in a separate package.
- **Behavioral tests only.** Tests run against a real Postgres instance — no mocks, no stubs. Mocked database tests hide real bugs.
- **Simplicity over cleverness.** The best change is usually the one that removes code.

## Getting started

### Prerequisites

- Node.js 20+
- pnpm
- A reachable Postgres instance (set `DATABASE_URL` in your environment or a local `.env`)

### Setup

```sh
git clone https://github.com/mabulu-inc/simplicity-db.git
cd simplicity-db
pnpm install
```

### Running the test suite

```sh
pnpm test    # runs node --test against tests/
pnpm lint    # eslint
```

Both must pass before submitting a PR.

## Making a change

1. **Fork** the repo and create a branch off `main`.
2. **Write a failing test** under `tests/` that describes the behavior you want.
3. **Make the smallest change** to `index.mjs` (or `src/`) that turns the test green.
4. **Run `pnpm test` and `pnpm lint`** — both must pass.
5. **Open a pull request** with a clear description of what changed and why.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — e.g. `fix: ...`, `feat: ...`, `docs: ...`, `chore: ...`. This keeps release notes readable.

## Release process (maintainers only)

Releases are automated via GitHub Actions + npm trusted publishing:

```sh
pnpm release:patch   # bug fixes
pnpm release:minor   # new backward-compatible features
pnpm release:major   # breaking changes
```

Each script bumps the version, tags the commit, pushes, and creates a GitHub release. The `publish.yml` workflow then publishes to npm via OIDC — no tokens required.

## Reporting issues

Open an issue at https://github.com/mabulu-inc/simplicity-db/issues with:

- What you expected to happen
- What actually happened
- A minimal reproduction (Node version, Postgres version, code snippet)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
