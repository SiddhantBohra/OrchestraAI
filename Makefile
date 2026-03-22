# Makefile for OrchestraAI

.PHONY: help install dev build start stop clean logs

# Default target
help:
	@echo "OrchestraAI - Development Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install     Install all dependencies"
	@echo "  dev         Start development environment"
	@echo "  build       Build all applications"
	@echo "  start       Start production containers"
	@echo "  stop        Stop all containers"
	@echo "  clean       Remove all containers and volumes"
	@echo "  logs        View container logs"
	@echo "  db-migrate  Run database migrations"
	@echo "  sdk-python  Build Python SDK"
	@echo "  sdk-ts      Build TypeScript SDK"

# Install dependencies
install:
	npm install
	cd apps/api && npm install
	cd apps/web && npm install
	cd sdks/typescript && npm install

# Start development environment
dev:
	docker compose up -d postgres clickhouse redis
	npm run dev

# Build all applications
build:
	npm run build

# Start production containers
start:
	docker compose up -d

# Stop all containers
stop:
	docker compose down

# Remove all containers and volumes
clean:
	docker compose down -v
	rm -rf apps/api/dist
	rm -rf apps/web/.next
	rm -rf sdks/typescript/dist

# View container logs
logs:
	docker compose logs -f

# View specific service logs
logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

logs-db:
	docker compose logs -f postgres clickhouse

# Database operations
db-migrate:
	cd apps/api && npm run migration:run

db-seed:
	cd apps/api && npm run seed

# SDK builds
sdk-python:
	cd sdks/python && pip install -e .

sdk-ts:
	cd sdks/typescript && npm run build

# Testing
test:
	npm run test

test-api:
	cd apps/api && npm run test

test-web:
	cd apps/web && npm run test

# Linting
lint:
	npm run lint

lint-fix:
	npm run lint:fix

# Type checking
typecheck:
	npm run typecheck
