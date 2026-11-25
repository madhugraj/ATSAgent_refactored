# Shared service image template (refactor plan Phase 9). Copy per service.
# Build from the repo root so the contract-generated code travels with it:
#   docker build -f services/_template/Dockerfile services/_template
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /srv/app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev
COPY app ./app
RUN uv sync --locked --no-dev

FROM python:3.12-slim-bookworm AS run

# Non-root: Cloud Run injects traffic on 8080; nothing in the image needs root.
RUN useradd --system --create-home --uid 10001 service
WORKDIR /srv/app
COPY --from=build /srv/app/.venv /srv/app/.venv
COPY --from=build /srv/app/app ./app

USER service
ENV PATH="/srv/app/.venv/bin:$PATH"
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", 8080)}/healthz', timeout=2)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
