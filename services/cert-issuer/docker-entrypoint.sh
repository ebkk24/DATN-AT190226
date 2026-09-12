#!/bin/sh
set -eu

: "${BITCOIN_RPC_USER:?Thiếu BITCOIN_RPC_USER}"
: "${BITCOIN_RPC_PASSWORD:?Thiếu BITCOIN_RPC_PASSWORD}"
: "${BITCOIN_RPC_HOST:=bitcoin-core}"
: "${BITCOIN_RPC_PORT:=18443}"

umask 077
mkdir -p "${HOME}/.bitcoin"
cat > "${HOME}/.bitcoin/bitcoin.conf" <<EOF
regtest=1
[regtest]
rpcconnect=${BITCOIN_RPC_HOST}
rpcport=${BITCOIN_RPC_PORT}
rpcuser=${BITCOIN_RPC_USER}
rpcpassword=${BITCOIN_RPC_PASSWORD}
EOF

exec "$@"
