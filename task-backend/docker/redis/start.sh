#!/bin/sh
# Starts Redis with two ACL users (passwords come from the environment, never from the image):
#   default        → Laravel: full access (cache, sessions, queue, publishing events)
#   taskflow_node  → Node.js: may ONLY subscribe to the task-events channel.
#                    No keys (sessions/cache stay private), no PUBLISH, no admin commands.
set -eu

: "${REDIS_PASSWORD:?REDIS_PASSWORD must be set}"
: "${REDIS_NODE_PASSWORD:?REDIS_NODE_PASSWORD must be set}"
NODE_USER="${REDIS_NODE_USERNAME:-taskflow_node}"
CHANNEL="${REDIS_EVENTS_CHANNEL:-taskflow:tasks}"

ACL_FILE=/tmp/users.acl
umask 077
cat > "$ACL_FILE" <<EOF
user default on >${REDIS_PASSWORD} ~* &* +@all
user ${NODE_USER} on >${REDIS_NODE_PASSWORD} resetkeys resetchannels &${CHANNEL} -@all +subscribe +unsubscribe +ping +select +hello +client|setname +client|setinfo +client|id
EOF

exec redis-server --appendonly yes --aclfile "$ACL_FILE"
