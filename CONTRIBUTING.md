# Contributing to OrchestraAI

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Prerequisites:** Node.js >= 20, Docker, Python >= 3.10
2. **Install:** `npm install`
3. **Infrastructure:** `docker compose up -d postgres redis`
4. **Configure:** `cp .env.example .env` and set `JWT_SECRET`
5. **Run API:** `npm run dev:api`
6. **Run Dashboard:** `npm run dev:web`

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run `npm run build` to ensure everything compiles
4. Test your changes against a running API
5. Open a pull request with a clear description

## Code Structure

See [AGENTS.md](AGENTS.md) for a detailed guide to the codebase.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Update migrations if you change entity schemas
- Keep enums in sync across shared, API, and SDKs
- Don't commit `.env` files or secrets
- Run `npm run build` before submitting

## Reporting Issues

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment (Node version, OS, Docker version)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
