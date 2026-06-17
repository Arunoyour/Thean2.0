FROM python:3.11-slim

WORKDIR /app

# build-essential: gcc, g++, libc6-dev, make (all needed to compile asyncpg/greenlet/uvloop/cffi on ARM)
# libpq-dev: asyncpg C headers
# postgresql-client: psql for the migration entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

RUN mkdir -p storage

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
