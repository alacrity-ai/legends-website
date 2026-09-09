.PHONY: help dev dev-site dev-worker dev-admin build build-admin lint preview install clean \
       docker-up docker-down docker-build docker-logs \
       deploy-worker deploy-admin

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Local development ──────────────────────────────────────

install: ## Install dependencies (site + worker + admin)
	npm install
	cd worker && npm install
	cd admin && npm install

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
	cd admin && npx wrangler pages deploy dist --project-name legends-admin --commit-dirty=true

# ── Cleanup ────────────────────────────────────────────────

clean: ## Remove build artifacts and node_modules
	rm -rf dist node_modules worker/node_modules admin/dist admin/node_modules
