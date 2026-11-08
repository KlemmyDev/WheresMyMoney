# One image: the app (FastAPI) with the web app built into it.
#
# It runs as an ordinary user, not root: docker-entrypoint.sh hands it the data folder and drops root.
#
# The base images are pinned by digest, so a rebuild gets exactly the same ones. They work on amd64 and arm64
# (a Raspberry Pi with a 64-bit OS). To move to newer ones, look up each tag's current digest, e.g.
#   docker buildx imagetools inspect node:24-slim        (the "Digest:" at the top)
# and replace the sha256 after the @ (uv's tag names a version: move both together).

# ---- the web app: built with Node; only its static output is kept
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# The business catalogue lives with the app (it reads the names and categories); the web app draws its marks.
COPY app/features/spending/businesses.json /app/features/spending/businesses.json
RUN npm run build

# ---- the app
FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
# tzdata so days roll over (and the spending month counts) in $TZ
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.12.24@sha256:3af4716e991d6956a41e573eab705d0ee08500cd829ed30293eb8472f372c65a /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY docker-entrypoint.sh /usr/local/bin/
COPY app ./app
RUN python -m compileall -q app
COPY --from=web /web/dist/client ./web/dist/client
# The commit it's built from (install.sh passes it), so it can tell when GitHub has a newer one. Last, as it changes
# with every build.
ARG GIT_COMMIT=""
ENV DB_PATH=/data/wheresmymoney.db GIT_COMMIT=${GIT_COMMIT}
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
