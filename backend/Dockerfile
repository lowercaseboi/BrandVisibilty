# Backend image: FastAPI API + pipeline CLI (scripts/). Same image runs both.
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

WORKDIR /app

# Dependencies first so code edits don't bust the layer cache.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# sed: a Windows checkout may give the script CRLF endings, which breaks the shebang.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data

# 8000 is the docker-compose default; hosts like Render/Railway override it by
# injecting $PORT, which the HEALTHCHECK and CMD below both read at runtime.
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health')" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# Shell form (not exec-form JSON) so ${PORT:-8000} expands at container start, not build time.
CMD ["sh", "-c", "exec uvicorn app.interface.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
