## Dọn nhanh trước khi trình diễn

Script dưới đây chỉ tác động namespace `datn-blockcerts-repro`; không xóa stack chính, dữ liệu chính hoặc các artifact benchmark đã lưu:

```bash
bash experiments/repro/scripts/demo-reset.sh --dry-run
bash experiments/repro/scripts/demo-reset.sh --quick
```

- `--dry-run`: kiểm tra namespace container và allowlist bảng, không thay đổi dữ liệu.
- `--quick`: giữ image, dependency, schema, migration và blockchain regtest; chỉ làm sạch dữ liệu nghiệp vụ, queue Redis và tệp sinh trong runtime, sau đó tạo lại bốn tài khoản thử nghiệm và chạy health check.
- `--full`: xóa toàn bộ volume/runtime của stack repro rồi chuẩn bị lại từ đầu; dùng cho tái lập đầy đủ, không dùng trước mỗi lần demo.

Dấu hiệu sẵn sàng:

```text
DEMO_READY mode=quick health=PASS accounts=READY data=CLEAN
```

# Bộ tái lập thực nghiệm Chương 3

Bộ này triển khai và kiểm thử hệ thống từ **mã nguồn đã có sẵn trên máy**. Không có bước `git clone`. Toàn bộ trạng thái chạy được đặt trong `experiments/repro/runtime/` và bị Git bỏ qua.

## Ranh giới an toàn

- Compose project: `datn-blockcerts-repro`.
- Container: `datn-repro-postgres`, `datn-repro-redis`, `datn-repro-bitcoin-core`.
- Volume: `datn_repro_postgres_data`, `datn_repro_redis_data`, `datn_repro_bitcoin_data`.
- Cổng host: PostgreSQL `15432`, Redis `16379`, Bitcoin RPC `28443`, API `14000`, Web `18088`.
- Không dùng và không xóa container/volume của bản triển khai tại cổng `4000`/`8088`.
- Khóa regtest, mật khẩu, JWT secret và tài khoản tạm được sinh ngẫu nhiên trong `runtime/`; không in giá trị ra terminal, không đưa vào Git hoặc báo cáo.
- `--reset`/`--purge` chỉ được phép tác động đúng project và volume nêu trên. Không chạy `docker system prune`.
- Docker daemon là ranh giới đặc quyền đáng kể. Bitcoin `regtest` chỉ phục vụ demo và đánh giá đồ án, không phải cấu hình production.

## Điều kiện tiên quyết

Ubuntu 22.04, Docker/Compose, Node.js/npm, Nginx, cURL, OpenSSL và Python 3. Chạy kiểm tra:

```bash
cd /duong-dan/toi/datn-blockcerts
docker --version
docker compose version
node --version
npm --version
nginx -v
python3 --version
```

Khi dùng `--benchmark`, runner chạy 9 lô `10/100/500 × 3`, sau đó `audit-benchmark-artifacts.mjs` đối chiếu DB, manifest, checksum từng chứng thư, Merkle proof, Bitcoin `OP_RETURN` và chạy `cert-verifier-js` trên toàn bộ 1.830 chứng thư trong một container. Kết quả nằm ở `runtime/results/benchmark-artifact-audit.json`.

## Triển khai từng bước

### 1. Chuẩn bị, build, tạo stack riêng và migration

```bash
cd /duong-dan/toi/datn-blockcerts
bash experiments/repro/scripts/prepare.sh
```

Lần chạy đầu sẽ: cài dependency khóa bởi lockfile; build backend, ba frontend và ba image Blockcerts; tạo `.env` bí mật; dựng PostgreSQL/Redis/Bitcoin regtest riêng; sinh WIF và Issuing Address; cấp UTXO; dựng watch-only wallet; sinh cấu hình Blockcerts; chạy đủ 10 migration; kiểm tra Nginx.

Chỉ khi cần xóa toàn bộ dữ liệu **của stack kiểm thử** và làm lại từ đầu:

```bash
bash experiments/repro/scripts/prepare.sh --reset
```

### 2. Chạy backend và Nginx kiểm thử

```bash
bash experiments/repro/scripts/start.sh
```

Backend chạy tại `127.0.0.1:14000`; Nginx chạy độc lập tại `127.0.0.1:18088`, không sửa Nginx hệ thống cổng 80 và không ảnh hưởng hệ thống đồ án cổng 8088.

### 3. Checkpoint sức khỏe

```bash
bash experiments/repro/scripts/health.sh
```

PASS khi xuất hiện:

```text
HEALTH_PASS containers=3 migrations=10 api=200 admin=200 student=200 verify=200
```

### 4. Kiểm thử chức năng và an toàn mặc định

```bash
bash experiments/repro/scripts/run-tests.sh
```

Phạm vi mặc định:

- 11 suite/42 test backend;
- 10 tình huống chống SSRF và 6 kiểm thử ngữ nghĩa INVALID/INDETERMINATE;
- tạo tài khoản tạm với mode `600`;
- đăng nhập và RBAC Maker/Checker/Student;
- cách ly Holder kể cả hai Student trùng họ tên;
- phát hành Blockcerts, kiểm tra Merkle root/TXID/confirmation;
- xác minh chứng thư nguyên gốc;
- phát hiện sửa tên, tên văn bằng, proof và TXID;
- thu hồi và kiểm tra Revocation List;
- kiểm tra audit log;
- fault injection ngay sau broadcast, retry từ checkpoint, cùng TXID và chỉ tăng một block.

PASS khi dòng cuối là:

```text
TEST_PASS default=PASS benchmark=SKIPPED
```

### 5. Benchmark tùy chọn

```bash
bash experiments/repro/scripts/run-tests.sh --benchmark
```

Chế độ này chạy `10/100/500 × 3`. Mỗi run phải đạt 100%, đúng một TXID, một Merkle root, các `certUid` không trùng, `blockDelta=1`, có ít nhất một confirmation và ba mẫu đầu/giữa/cuối xác minh `VALID`. Ba mẫu này là kiểm tra đại diện theo vị trí, **không phải** xác minh toàn bộ chứng thư và không biểu diễn người dùng đồng thời.

Có thể chạy toàn bộ từ chuẩn bị đến kiểm thử bằng một lệnh:

```bash
bash experiments/repro/scripts/run-all.sh
bash experiments/repro/scripts/run-all.sh --benchmark
```

## Dừng và làm sạch

Dừng backend/Nginx, giữ container và dữ liệu kiểm thử:

```bash
bash experiments/repro/scripts/stop.sh --app-only
```

Dừng cả container nhưng giữ volume:

```bash
bash experiments/repro/scripts/stop.sh --down
```

Xóa stack và volume kiểm thử (thao tác phá hủy, chỉ đúng namespace repro):

```bash
bash experiments/repro/scripts/stop.sh --purge
```

## Vị trí kết quả

- Kết quả của lượt đang chạy: `experiments/repro/runtime/results/`.
- Gói bằng chứng bất biến theo `runId`: `experiments/repro/runtime/evidence/<runId>/`; `MANIFEST.json` chứa SHA-256 từng tệp và checksum nội dung.
- Mỗi lượt `run-tests.sh` dừng ứng dụng repro, chuyển kết quả cũ sang `runtime/history/`, tạo fingerprint cây nguồn rồi chạy mới; không tái sử dụng benchmark của cây nguồn khác.
- Log: `experiments/repro/runtime/logs/`.
- Chứng thư: `experiments/repro/runtime/project/blockcerts/cert-issuer/blockchain_certificates/`.
- Tài khoản và khóa: `experiments/repro/runtime/private/`, `runtime/project/storage/credentials/` (không công bố).

## Mã nguồn đầy đủ

- Repository: `https://github.com/ebkk24/DATN-AT190226`
- Backend: `backend/src/`
- Cổng quản trị: `frontend-admin/src/`
- Cổng sinh viên: `frontend-client/src/`
- Cổng xác minh công khai: `frontend-verify/src/`
- Dịch vụ xác minh/SSRF: `apps/verifier-service/`, `adapters/regtest-anchor-adapter/`
- Blockcerts: `blockcerts/`

Chương 3 và phụ lục chỉ trích các tệp trực tiếp được viện dẫn. Khi working tree chưa commit, bằng chứng phải đối chiếu đồng thời `commit` và `sourceTreeSha256` trong `source-manifest.json`; commit đơn lẻ không đại diện đủ cây nguồn thực nghiệm.
