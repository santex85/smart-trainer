#!/bin/bash
# Add 2GB swap for 2GB RAM servers. Run manually on server: bash deploy/setup-swap.sh
# Requires root.
set -e
if [ ! -f /swapfile ]; then
  echo "Creating 2GB swap file..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled. Current: $(free -h | grep Swap)"
else
  echo "Swap file already exists. Current: $(free -h | grep Swap)"
fi
