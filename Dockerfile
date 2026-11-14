# Multi-stage: build the React client, then serve it from the FastAPI hub so the
# client and API share one origin (no CORS, no hardcoded hub URL in production).

# --- Stage 1: build the client (Vite) ---
FROM node:20-slim AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Baked so the client can authenticate writes to the hub. Same-origin in prod,
# so VITE_HUB_URL stays empty (requests are relative).
ARG VITE_HUB_TOKEN=""
RUN VITE_HUB_TOKEN="$VITE_HUB_TOKEN" npm run build

# --- Stage 2: the hub (FastAPI), serving the API + the built client ---
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY hub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY hub/app ./app
COPY --from=client /client/dist ./client_dist

# The SQLite log lives on a mounted volume.
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
