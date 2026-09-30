#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope
for c in docker node npm curl openssl python3 nginx; do require_cmd "$c"; done
RESET=0
[[ "${1:-}" == "--reset" ]] && RESET=1
if (( RESET )); then
  echo "Chỉ xóa stack kiểm thử datn-blockcerts-repro; không đụng stack datn-blockcerts."
  if [[ -f "$PROJECT/compose.yaml" && -f "$PROJECT/.env" ]]; then
    (cd "$PROJECT" && docker compose down -v --remove-orphans) || true
  fi
  rm -rf "$RUNTIME"
fi
mkdir -p "$PROJECT" "$LOGS" "$PIDS" "$RESULTS" "$PRIVATE"
chmod 700 "$RUNTIME" "$PRIVATE"

if [[ ! -f "$ENV_FILE" ]]; then
  pg_pass="$(openssl rand -hex 24)"; redis_pass="$(openssl rand -hex 24)"
  rpc_user="repro_$(openssl rand -hex 8)"; rpc_pass="$(openssl rand -hex 24)"; jwt="$(openssl rand -hex 48)"
  cat >"$ENV_FILE" <<EOF
REPRO_PROJECT=datn-blockcerts-repro
REPRO_API_PORT=14000
REPRO_WEB_PORT=18088
REPRO_POSTGRES_PORT=15432
REPRO_REDIS_PORT=16379
REPRO_BITCOIN_PORT=28443
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=15432
POSTGRES_DB=datn_repro
POSTGRES_USER=datn_repro
POSTGRES_PASSWORD=$pg_pass
REDIS_HOST=127.0.0.1
REDIS_PORT=16379
REDIS_PASSWORD=$redis_pass
REDIS_URL=redis://:$redis_pass@127.0.0.1:16379
BITCOIN_RPC_HOST=127.0.0.1
BITCOIN_RPC_PORT=28443
BITCOIN_RPC_URL=http://127.0.0.1:28443
BITCOIN_WALLET=cert_issuer_watch
BITCOIN_RPC_USER=$rpc_user
BITCOIN_RPC_PASSWORD=$rpc_pass
JWT_SECRET=$jwt
JWT_EXPIRES_IN=8h
PORT=14000
JSON_BODY_LIMIT=2mb
PUBLIC_BASE_URL=http://127.0.0.1:18088
ISSUING_ADDRESS=PENDING
VERIFY_TIMEOUT_MS=120000
REVOCATION_RECONCILE_INTERVAL_MS=10000
VERIFICATION_LOG_RETENTION_DAYS=90
LOCAL_UID=$(id -u)
LOCAL_GID=$(id -g)
EOF
  chmod 600 "$ENV_FILE"
fi
load_env

for port in "$REPRO_POSTGRES_PORT" "$REPRO_REDIS_PORT" "$REPRO_BITCOIN_PORT" "$REPRO_API_PORT" "$REPRO_WEB_PORT"; do
  if ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    case "$port" in
      "$REPRO_POSTGRES_PORT"|"$REPRO_REDIS_PORT"|"$REPRO_BITCOIN_PORT") : ;;
      *) fail "Cổng kiểm thử $port đang được dùng" ;;
    esac
  fi
done

echo "[1/8] Cài phụ thuộc, kiểm thử biên dịch và build từ mã nguồn hiện có"
(cd "$REPO/backend" && npm ci --silent && npm run build)
for app in frontend-admin frontend-client frontend-verify; do (cd "$REPO/$app" && npm ci --silent && npm run build); done
(cd "$REPO/apps/verifier-service" && npm ci --silent)
(cd "$REPO" && docker compose --profile tools build cert-tools cert-issuer verifier-service)

echo "[2/8] Tạo cây dự án runtime tách biệt"
rm -rf "$PROJECT/blockcerts" "$PROJECT/backend" "$PROJECT/scripts" "$PROJECT/deploy"
mkdir -p "$PROJECT/blockcerts" "$PROJECT/backend/scripts" "$PROJECT/scripts" "$PROJECT/storage/credentials" "$PROJECT/deploy/www" \
  "$PROJECT/blockcerts/cert-issuer/signed_certificates" "$PROJECT/blockcerts/cert-issuer/blockchain_certificates" "$PROJECT/blockcerts/cert-issuer/work"
cp -a "$REPO/blockcerts/cert-tools" "$PROJECT/blockcerts/"
cp -a "$REPO/blockcerts/cert-issuer/config" "$PROJECT/blockcerts/cert-issuer/"
cp -a "$REPO/blockcerts/issuer" "$PROJECT/blockcerts/"
find "$PROJECT/blockcerts/cert-tools/unsigned_certificates" -type f -name '*.json' -delete 2>/dev/null || true
cp "$REPO/backend/scripts/cert-issuer-checkpoint.py" "$PROJECT/backend/scripts/"
cp "$REPO/scripts/mine-regtest-block.sh" "$REPO/scripts/setup-regtest-watch-wallet.sh" "$PROJECT/scripts/"
cp "$REPRO/config/compose.yaml" "$PROJECT/compose.yaml"
cp "$ENV_FILE" "$PROJECT/.env"; chmod 600 "$PROJECT/.env"
for app in admin student verify; do mkdir -p "$PROJECT/deploy/www/$app"; done
cp -a "$REPO/frontend-admin/dist/." "$PROJECT/deploy/www/admin/"
cp -a "$REPO/frontend-client/dist/." "$PROJECT/deploy/www/student/"
cp -a "$REPO/frontend-verify/dist/." "$PROJECT/deploy/www/verify/"

echo "[3/8] Khởi động PostgreSQL, Redis và Bitcoin regtest của stack riêng"
dc config --quiet
dc up -d postgres redis bitcoin-core
for service in postgres redis bitcoin-core; do
  for i in {1..60}; do
    status="$(dc ps --format json "$service" 2>/dev/null | python3 -c 'import json,sys; x=json.load(sys.stdin); print((x[0] if isinstance(x,list) and x else x).get("Health", ""))' 2>/dev/null || true)"
    [[ "$status" == "healthy" ]] && break
    sleep 2
  done
  [[ "$status" == "healthy" ]] || fail "$service không healthy"
done

if [[ ! -s "$PROJECT/storage/credentials/pk_issuer.txt" ]]; then
  echo "[4/8] Tạo khóa phát hành dùng riêng cho regtest và cấp UTXO"
  CLI=(docker exec datn-repro-bitcoin-core /opt/bitcoin-31.1/bin/bitcoin-cli -regtest -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD")
  mapfile -t keypair < <(docker run --rm --entrypoint python datn/cert-issuer:3.13.1 -c 'import secrets; from pycoin.symbols.xtn import network; k=network.keys.private(secret_exponent=secrets.randbelow(network.generator.order()-1)+1,is_compressed=True); print(k.address()); print(k.wif())')
  issuer="${keypair[0]}"; wif="${keypair[1]}"
  printf '%s\n' "$wif" >"$PROJECT/storage/credentials/pk_issuer.txt"; chmod 600 "$PROJECT/storage/credentials/pk_issuer.txt"
  "${CLI[@]}" generatetoaddress 101 "$issuer" >/dev/null
  "${CLI[@]}" -named createwallet wallet_name=blockcerts_issuer descriptors=true load_on_startup=false >/dev/null
  "${CLI[@]}" unloadwallet blockcerts_issuer false >/dev/null
  sed -i "s/^ISSUING_ADDRESS=.*/ISSUING_ADDRESS=$issuer/" "$ENV_FILE" "$PROJECT/.env"
else
  issuer="$(grep '^ISSUING_ADDRESS=' "$ENV_FILE" | cut -d= -f2-)"
fi
export ISSUING_ADDRESS="$issuer"

[[ "$ISSUING_ADDRESS" != PENDING ]] || fail "Không tạo được địa chỉ phát hành"
echo "[5/8] Sinh cấu hình Blockcerts cho URL và địa chỉ của stack kiểm thử"
python3 "$REPO/scripts/configure-public-base.py" --root "$PROJECT" "$PUBLIC_BASE_URL"
ISSUER="$ISSUING_ADDRESS" BASE="$PUBLIC_BASE_URL" PROJECT="$PROJECT" python3 - <<'PY'
import json, os, re
from pathlib import Path
root=Path(os.environ['PROJECT']); issuer=os.environ['ISSUER']; base=os.environ['BASE'].rstrip('/')
profile_path=root/'blockcerts/issuer/profile.json'
profile=json.loads(profile_path.read_text())
profile['id']=f'{base}/api/blockcerts/issuers/kma/profile.json'
profile['revocationList']=f'{base}/api/blockcerts/issuers/kma/revocation-list.json'
profile['publicKey']=[{'id':f'ecdsa-koblitz-pubkey:{issuer}','created':'2026-01-01T00:00:00Z'}]
profile_path.write_text(json.dumps(profile,ensure_ascii=False,indent=2)+'\n')
(root/'blockcerts/issuer/issuing-address.txt').write_text(issuer+'\n')
conf=root/'blockcerts/cert-tools/config/conf.ini'; text=conf.read_text()
text=re.sub(r'^issuer_id\s*=.*$',f'issuer_id = {base}/api/blockcerts/issuers/kma/profile.json',text,flags=re.M); conf.write_text(text)
tpl=root/'blockcerts/cert-tools/certificate_templates/diploma-v3.json'; data=json.loads(tpl.read_text()); data['issuer']=f'{base}/api/blockcerts/issuers/kma/profile.json'; tpl.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
ici=root/'blockcerts/cert-issuer/config/conf.ini'; text=ici.read_text(); text=re.sub(r'^issuing_address\s*=.*$',f'issuing_address = {issuer}',text,flags=re.M); text=re.sub(r'^verification_method\s*=.*$',f'verification_method = {base}/api/blockcerts/issuers/kma/profile.json',text,flags=re.M); ici.write_text(text)
PY
chmod 600 "$PROJECT/storage/credentials/pk_issuer.txt"
(cd "$PROJECT" && sh scripts/setup-regtest-watch-wallet.sh)

echo "[6/8] Chạy 9 migration trên cơ sở dữ liệu kiểm thử"
set -a; source "$ENV_FILE"; set +a
(cd "$REPO/backend" && DATN_ENV_FILE="$ENV_FILE" npm run migration:run)

echo "[7/8] Tạo cấu hình Nginx cổng $REPRO_WEB_PORT"
mkdir -p "$RUNTIME/nginx/client_body" "$RUNTIME/nginx/proxy_temp" "$LOGS" "$PIDS"
python3 - "$REPRO/config/nginx.conf.template" "$RUNTIME/nginx.conf" "$RUNTIME" "$PROJECT" "$REPRO_WEB_PORT" "$REPRO_API_PORT" <<'PY'
from pathlib import Path
import sys
src,out,runtime,project,web,api=sys.argv[1:]
t=Path(src).read_text().replace('@@RUNTIME@@',runtime).replace('@@PROJECT@@',project).replace('@@WEB_PORT@@',web).replace('@@API_PORT@@',api)
Path(out).write_text(t)
PY
nginx -t -c "$RUNTIME/nginx.conf" -p "$RUNTIME/nginx" 2>>"$LOGS/nginx-startup.log"

echo "[8/8] Kiểm tra phạm vi cách ly"
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' datn-repro-postgres)" == datn-blockcerts-repro ]] || fail "Sai Compose project"
printf 'PREPARE_PASS stack=%s api=%s web=%s key_mode=%s\n' "$REPRO_PROJECT" "$REPRO_API_PORT" "$REPRO_WEB_PORT" "$(stat -c '%a' "$PROJECT/storage/credentials/pk_issuer.txt")"
