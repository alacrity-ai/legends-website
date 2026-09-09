.PHONY: help dev dev-site dev-worker dev-admin build build-admin lint preview install clean \
       docker-up docker-down docker-build docker-logs \
       deploy-worker deploy-admin test test-shared test-worker test-e2e d1-migrate-local d1-migrate-remote

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Local development ──────────────────────────────────────

install: ## Install dependencies (site + worker + admin + shared tests + e2e)
	npm install
	cd worker && npm install
	cd admin && npm install
	cd shared && npm install
	cd tests/e2e && npm install && npx playwright install chromium

dev: ## Start site and worker locally (requires two terminals — use docker-up for one command)
	@echo "Run 'make dev-site' and 'make dev-worker' in separate terminals,"
	@echo "or use 'make docker-up' to start both at once."

dev-site: ## Start the Vite dev server
	npm run dev

dev-worker: ## Start the Cloudflare Worker dev server
	cd worker && npm run dev

dev-admin: ## Start the admin PWA dev server (:5174, proxies /api to the worker)
	cd admin && npm run dev

build: ## Production build of the public site (outputs to dist/)
	npm run build

build-admin: ## Production build of the admin PWA (outputs to admin/dist/)
	cd admin && npm run build

lint: ## Run ESLint
	npm run lint

test: test-shared test-worker test-e2e ## Every suite: shared unit → worker integration → browser e2e

test-shared: ## Unit tests for shared/seating (geometry, ids, validation, seat assignment)
	cd shared && npx vitest run

test-worker: ## Worker integration tests inside workerd (local D1/KV/R2, Square mocked)
	cd worker && npx vitest run

test-e2e: ## Playwright: buyer flow + door console against a prod build of site/admin + wrangler dev (ports 8797/5183/5184)
	cd tests/e2e && npx playwright test

preview: ## Preview the production build locally
	npm run preview

# ── Docker ─────────────────────────────────────────────────

docker-up: ## Start site + worker via Docker Compose
	docker compose up

docker-up-d: ## Start site + worker in background
	docker compose up -d

docker-down: ## Stop Docker Compose services
	docker compose down

docker-build: ## Rebuild Docker images
	docker compose build

docker-logs: ## Tail logs from running containers
	docker compose logs -f

# ── Deploy ─────────────────────────────────────────────────

deploy-worker: ## Deploy the worker to Cloudflare
	cd worker && npm run deploy

deploy-admin: build-admin ## Build + deploy the admin PWA to Cloudflare Pages (legends-admin)
	# --branch main: the Pages project’s production branch is `main`; without it a deploy from a feature branch only creates a preview.
	cd admin && npx wrangler pages deploy dist --project-name legends-admin --branch main --commit-dirty=true

# ── D1 (seating) ─────────────────────────────────────────────
# The Legends deploy token has no D1 scope; use the shared account token:
#   CLOUDFLARE_API_TOKEN=$$(agentsecrets get cloudflare_api_token) make d1-migrate-remote

d1-migrate-local: ## Apply worker/migrations to the local D1 (wrangler dev state)
	cd worker && npx wrangler d1 migrations apply legends-seating --local

d1-migrate-remote: ## Apply worker/migrations to the production D1
	cd worker && npx wrangler d1 migrations apply legends-seating --remote

# ── Cleanup ────────────────────────────────────────────────

clean: ## Remove build artifacts and node_modules
	rm -rf dist node_modules worker/node_modules admin/dist admin/node_modules shared/node_modules
