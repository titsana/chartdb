#!/bin/sh
# headersHelper for MCP clients (Claude Code) talking to chartdb's /api/mcp.
# Prints the JSON header object Claude Code expects. Claude Code re-runs it
# on every connect and after any 401, and `az` caches/refreshes the token
# itself, so token expiry mid-session is handled.
#
# Needs no arguments: the MCP URL comes from CLAUDE_CODE_MCP_SERVER_URL (set
# by Claude Code) or $1, and AUTH_MODE / ENTRA_CLIENT_ID / ENTRA_TENANT_ID
# are read from the server's own public /config.js. AUTH_MODE=public prints
# no headers. For azure-ad: `az login` once, and the Azure CLI must be an
# authorized client application of the app registration (server/README.md).
set -eu
url="${CLAUDE_CODE_MCP_SERVER_URL:-${1:-}}"
[ -n "$url" ] || { echo "usage: $0 <https://host/api/mcp>" >&2; exit 1; }
origin="${url%/api/mcp}"
config=$(curl -fsS "$origin/config.js")

env_value() {
    printf '%s' "$config" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"
}

if [ "$(env_value AUTH_MODE)" != "azure-ad" ]; then
    echo '{}'
    exit 0
fi

token=$(az account get-access-token \
    --tenant "$(env_value ENTRA_TENANT_ID)" \
    --scope "api://$(env_value ENTRA_CLIENT_ID)/access_as_user" \
    --query accessToken -o tsv)
printf '{"Authorization": "Bearer %s"}\n' "$token"
