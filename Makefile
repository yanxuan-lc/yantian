# Entry points of the Yantian extension. Run from the repository root.

.PHONY: help deps fmt lint typecheck test build pack check

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

deps: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

fmt: ## Format and apply safe lint fixes
	pnpm exec biome check --write .

lint: ## Check formatting and lint rules
	pnpm exec biome check .

typecheck: ## Typecheck backend and browser sources
	pnpm typecheck

test: ## Run the test suite
	pnpm test

build: ## Build dist/ and ui/
	pnpm build

pack: build ## Pack the extension into dist-pack/
	@mkdir -p dist-pack
	@npm pack --pack-destination dist-pack >/dev/null
	@ls dist-pack

check: lint typecheck test build ## Gate for every change
