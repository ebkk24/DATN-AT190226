# Hệ thống quản lý và xác minh văn bằng sử dụng Blockcerts

Đồ án tốt nghiệp của Phạm Đức Khải – AT190226.

## Kiến trúc dự kiến

Ứng dụng web
→ API nghiệp vụ
→ PostgreSQL và kho tệp
→ hàng đợi/worker phát hành
→ cert-tools/cert-issuer
→ Bitcoin Core regtest
→ chứng thư Blockcerts
→ cert-verifier-js và Regtest Anchor Adapter

## Nguyên tắc an toàn

- Không lưu khóa phát hành trong repository.
- Không đưa mật khẩu PostgreSQL hoặc thông tin Bitcoin RPC vào mã nguồn.
- Không lưu dữ liệu cá nhân hoặc toàn bộ văn bằng trên Blockchain.
- Frontend không được gọi trực tiếp Bitcoin Core RPC.
- Các công cụ Blockcerts phải chạy trong môi trường được cô lập.
