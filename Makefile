dev:
	npm run dev

build-check:
	npm run build:check

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose down && docker compose up -d --build
