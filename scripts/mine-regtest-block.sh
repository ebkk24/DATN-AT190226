#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
WALLET="blockcerts_issuer"
CLI='/opt/bitcoin-31.1/bin/bitcoin-cli -regtest -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD"'
docker compose exec -T bitcoin-core sh -c "$CLI loadwallet '$WALLET' false" >/dev/null 2>&1 || true
cleanup() { docker compose exec -T bitcoin-core sh -c "$CLI unloadwallet '$WALLET' false" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
ADDRESS="$(docker compose exec -T bitcoin-core sh -c "$CLI -rpcwallet='$WALLET' getnewaddress 'regtest-confirmation' 'bech32'")"
docker compose exec -T bitcoin-core sh -c "$CLI generatetoaddress 1 '$ADDRESS'"
cleanup
trap - EXIT INT TERM
printf '%s
' "Đã tạo 1 block xác nhận và trả nút về ví watch-only."
