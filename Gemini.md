# Tooling Rules

- **Bun**: Use `bun` and `bunx` for JS/TS (deps, scripts, runtime). Never `npm`, `yarn`, `pnpm`.
- **UV**: Use `uv` for Python (deps, venv, run). Never `pip`, `poetry`, `conda`.
- **Unsupported**: If tool or package unsupported by Bun or UV, halt immediately and notify user. Never fallback without permission.
