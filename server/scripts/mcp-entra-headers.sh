#!/bin/sh
# headersHelper for MCP clients (Claude Code) talking to /api/mcp when the
# server runs AUTH_MODE=azure-ad. Prints the JSON header object Claude Code
# expects. Claude Code re-runs it on every connect and after any 401, and
# `az` caches/refreshes the token itself, so expiry mid-session is handled.
#
# Usage: mcp-entra-headers.sh <ENTRA_CLIENT_ID> [ENTRA_TENANT_ID]
# Needs: `az login` done once, and the Azure CLI added as an authorized
# client application of this app registration (see server/README.md).
set -eu
client_id="$1"
tenant_arg=""
[ -n "${2:-}" ] && tenant_arg="--tenant $2"
# shellcheck disable=SC2086
token=$(az account get-access-token $tenant_arg \
    --scope "api://$client_id/access_as_user" \
    --query accessToken -o tsv)
printf '{"Authorization": "Bearer %s"}\n' "$token"
