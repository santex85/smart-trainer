#!/bin/sh
set -e
# Substitute BACKEND_UPSTREAM for Swarm (st2_backend) vs compose (backend)
export BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-backend:8000}"
envsubst '${BACKEND_UPSTREAM}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
