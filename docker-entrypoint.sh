#!/bin/sh
set -e

echo "==> Checking database connection..."
if [ -n "$DATABASE_URL" ]; then
  echo "==> Waiting for PostgreSQL to be ready and pushing schema..."
  MAX_RETRIES=30
  COUNT=0
  until npx drizzle-kit push --force || [ $COUNT -eq $MAX_RETRIES ]; do
    echo "==> PostgreSQL not ready yet. Retrying in 2 seconds... ($COUNT/$MAX_RETRIES)"
    sleep 2
    COUNT=$((COUNT+1))
  done
  if [ $COUNT -eq $MAX_RETRIES ]; then
    echo "==> Warning: Could not connect to PostgreSQL after $MAX_RETRIES retries. Starting app anyway..."
  else
    echo "==> Database schema initialized successfully!"
  fi
fi

echo "==> Starting application..."
exec "$@"
