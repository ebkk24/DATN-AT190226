#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

echo "[1/7] Kiểm tra Compose và dịch vụ"
docker compose config --quiet
docker compose up -d postgres redis bitcoin-core >/dev/null
docker compose ps

echo "[2/7] Kiểm tra quyền khóa"
mode="$(stat -c '%a' storage/credentials/pk_issuer.txt)"
[ "$mode" = "600" ] || { echo "Lỗi: pk_issuer.txt phải có quyền 600, hiện là $mode"; exit 1; }

echo "[3/7] Kiểm tra phiên bản và chứng thư chưa neo"
docker compose --profile tools run --rm cert-tools python -c '
import glob,json
from importlib.metadata import version
from cert_schema.schema_validator import validate_v3
fs=glob.glob("unsigned_certificates/*.json")
assert len(fs)==1, f"Cần đúng 1 chứng thư chưa neo, hiện có {len(fs)}"
d=json.load(open(fs[0]))
assert validate_v3(d, ignore_proof=True)
assert d.get("nonce") and "proof" not in d
print("cert-tools",version("cert-tools"),"cert-schema",version("cert-schema"),fs[0])
'

echo "[4/7] Kiểm tra khóa khớp địa chỉ phát hành"
docker compose --profile tools run --rm cert-issuer python -c '
from bitcoin import SelectParams
from bitcoin.wallet import CBitcoinSecret,P2PKHBitcoinAddress
SelectParams("regtest")
k=CBitcoinSecret(open("/run/secrets/pk_issuer.txt").read().strip())
assert str(P2PKHBitcoinAddress.from_pubkey(k.pub))=="mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT"
print("Khóa và địa chỉ khớp nhau")
'

echo "[5/7] Kiểm tra UTXO qua đúng đường RPC của cert-issuer"
docker compose --profile tools run --rm cert-issuer python -c '
import bitcoin
bitcoin.SelectParams("regtest")
from bitcoin.rpc import Proxy
u=Proxy().listunspent(addrs=["mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT"])
assert u, "cert-issuer không nhìn thấy UTXO của địa chỉ phát hành"
print("UTXO:",len(u),"; xác nhận:",u[0]["confirmations"])
'

echo "[6/7] Kiểm tra pipeline Merkle/proof bằng mockchain, không broadcast"
docker compose --profile tools run --rm cert-issuer sh -c "
mkdir -p /tmp/preflight/signed /tmp/preflight/blockchain /tmp/preflight/work
/opt/venv/bin/cert-issuer -c /workspace/config/mock-preflight.ini >/tmp/preflight.log 2>&1
grep -q proof /tmp/preflight/blockchain/*.json
echo 'Mock proof hợp lệ về pipeline'
"

echo "[7/7] Kiểm tra tạo và ký giao dịch Bitcoin thật nhưng chặn broadcast"
docker compose --profile tools run --rm cert-issuer sh -c "
rm -rf /tmp/real-preflight
mkdir -p /tmp/real-preflight/signed /tmp/real-preflight/blockchain /tmp/real-preflight/work
/opt/venv/bin/python /workspace/config/real-preflight.py >/tmp/real-preflight.log 2>&1
grep -q 'broadcast bị chặn có chủ ý' /tmp/real-preflight.log
echo 'Ký giao dịch và kiểm tra OP_RETURN thành công; không broadcast'
"

echo "TIỀN KIỂM TRA THÀNH CÔNG — chưa có giao dịch nào được broadcast."
