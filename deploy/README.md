# Triển khai cổng 8088 bằng Nginx và systemd user

Tài liệu này áp dụng khi mã nguồn đã có sẵn trên máy. Cấu hình không giả định đường dẫn cài đặt, tên người dùng hay đường dẫn Node cố định.

## 1. Điều kiện tiên quyết

```bash
node --version
npm --version
docker --version
docker compose version
nginx -v
python3 --version
systemctl --user --version
```

Tạo cấu hình riêng tư và sửa toàn bộ placeholder:

```bash
cd /duong-dan/toi/datn-blockcerts
cp .env.example .env
chmod 600 .env
```

Các biến bắt buộc gồm credential PostgreSQL/Redis/Bitcoin RPC, `JWT_SECRET` tối thiểu 32 ký tự, `DATN_ROOT` là đường dẫn tuyệt đối đến repository, `PUBLIC_BASE_URL` là origin truy cập thật và `CORS_ORIGINS` là allowlist. Không commit `.env`, WIF hoặc dữ liệu tài khoản runtime.

## 2. Chuẩn bị hạ tầng và khóa regtest

```bash
docker compose config --quiet
docker compose up -d postgres redis bitcoin-core
docker compose ps
```

Khởi tạo địa chỉ phát hành, WIF và watch-only wallet theo [hướng dẫn regtest](../docs/installation/05-phat-hanh-regtest.md). Tệp `storage/credentials/pk_issuer.txt` phải tồn tại, thuộc người chạy dịch vụ và có mode `600`. `ISSUING_ADDRESS` trong `.env` phải khớp khóa này.

Nếu cần tái dựng hoàn toàn trong namespace cách ly, dùng `experiments/repro/scripts/prepare.sh`; script đó tự sinh secret, khóa regtest, UTXO, wallet, cấu hình và chạy đủ migration mà không đụng stack chính.

## 3. Kiểm tra trước khi cài dịch vụ

```bash
python3 scripts/configure-public-base.py --check "$PUBLIC_BASE_URL"
bash scripts/install-user-services.sh --dry-run
nginx -t -p "$PWD/deploy/" -c nginx/nginx.conf
```

Chế độ `--dry-run` chỉ render và kiểm tra hai unit từ `deploy/systemd/*.service.in`; không ghi vào `~/.config/systemd/user`, không enable và không khởi động dịch vụ.

## 4. Build, migration và khởi động

```bash
bash scripts/deploy-b12.sh
```

Script thực hiện theo thứ tự: kiểm tra `.env`; đồng bộ `PUBLIC_BASE_URL` vào cấu hình Blockcerts; render/cài hai systemd user unit theo đường dẫn và binary thực tế; build backend và ba frontend; sao chép static asset vào `deploy/www`; chạy migration; xóa dữ liệu cá nhân dư thừa khỏi verification log cũ; kiểm tra Nginx; restart backend/Nginx và chạy health check.

Đích chạy:

- Backend: `127.0.0.1:4000`.
- Nginx: cổng `8088`.
- Cổng sinh viên: `/student/`.
- Cổng quản trị: `/admin/`.
- Cổng xác minh công khai: `/verify/`.
- API: `/api/`; health: `/health`.

## 5. Xác minh sau triển khai

```bash
bash scripts/health-check-b12.sh
systemctl --user status datn-blockcerts-backend.service datn-blockcerts-nginx.service
journalctl --user -u datn-blockcerts-backend.service -n 100 --no-pager
journalctl --user -u datn-blockcerts-nginx.service -n 100 --no-pager
```

Chỉ mở cổng Nginx cần thiết. PostgreSQL, Redis, Bitcoin RPC và backend phải giữ ở loopback/mạng nội bộ. Cổng `8088` hiện là HTTP; phải đặt sau VPN/reverse proxy TLS hoặc bổ sung HTTPS trước khi truyền dữ liệu thật qua mạng không tin cậy.

## 6. Giới hạn an toàn

Backend/worker cần truy cập Docker daemon để chạy công cụ Blockcerts; quyền này gần tương đương đặc quyền root trên host. Bản regtest là nguyên mẫu phục vụ đồ án, không phải cấu hình production/mainnet. Không dùng khóa, volume hoặc credential của stack repro cho hệ thống khác.
