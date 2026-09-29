#!/bin/bash
cd /home/z/my-project
exec env \
  DATABASE_URL=postgresql://cryptsknexus:nexus_pg_2026@127.0.0.1:5432/cryptsknexus \
  SESSION_SECRET=cryptsk_session_secret_key_2026_isp_platform \
  NODE_OPTIONS=--max-old-space-size=1024 \
  /home/z/my-project/node_modules/.bin/next dev -p 3000 -H 0.0.0.0 \
  > /home/z/my-project/dev.log 2>&1
