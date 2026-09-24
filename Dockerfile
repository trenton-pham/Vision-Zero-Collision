FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN addgroup --system dashboard && adduser --system --ingroup dashboard dashboard
COPY pyproject.toml ./
COPY backend/ ./backend/
RUN pip install --upgrade pip && pip install .

COPY data/processed/ ./data/processed/
RUN python -m backend.scripts.build_artifacts
COPY --from=frontend-build /build/frontend/dist ./frontend/dist/

RUN chown -R dashboard:dashboard /app
USER dashboard
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

