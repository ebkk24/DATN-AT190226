#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

ISSUING_ADDRESS="$(cat blockcerts/issuer/issuing-address.txt)"
WATCH_WALLET="cert_issuer_watch"
BASE='/opt/bitcoin-31.1/bin/bitcoin-cli -regtest -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD"'

# Chỉ để một ví watch-only được tải, vì python-bitcoinlib của cert-issuer gọi RPC gốc.
for wallet in blockcerts_issuer demo_recipient; do
  docker compose exec -T bitcoin-core sh -c "$BASE unloadwallet '$wallet' false" >/dev/null 2>&1 || true
done

if ! docker compose exec -T bitcoin-core sh -c "$BASE listwallets" | grep -q "\"$WATCH_WALLET\""; then
  docker compose exec -T bitcoin-core sh -c "$BASE loadwallet '$WATCH_WALLET' true" >/dev/null 2>&1 || \
  docker compose exec -T bitcoin-core sh -c "$BASE createwallet '$WATCH_WALLET' true true '' false true true" >/dev/null
fi

DESC="$(docker compose exec -T bitcoin-core sh -c "$BASE getdescriptorinfo 'addr($ISSUING_ADDRESS)'" | sed -n 's/.*"descriptor": "\([^"]*\)".*/\1/p')"
docker compose exec -T bitcoin-core sh -c "$BASE -rpcwallet='$WATCH_WALLET' importdescriptors '[{\"desc\":\"$DESC\",\"timestamp\":0,\"active\":false,\"internal\":false,\"label\":\"cert-issuer-watch\"}]'" >/dev/null

echo "Ví watch-only đã sẵn sàng cho địa chỉ phát hành."
