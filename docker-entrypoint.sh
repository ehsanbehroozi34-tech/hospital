#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL to be ready and pushing schema..."
until npx drizzle-kit push --force; do
  echo "==> PostgreSQL not ready yet. Retrying in 2 seconds..."
  sleep 2
done

echo "==> Database schema initialized successfully!"
echo "==> Starting application..."

exec "$@"
