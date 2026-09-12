# Triển khai B12

- Backend/worker: systemd user `datn-blockcerts-backend.service`, bind `127.0.0.1:4000`.
- Nginx: systemd user `datn-blockcerts-nginx.service`, bind `127.0.0.1:8088`.
- Truy cập hiện tại: HTTP trên IP/hostname Tailscale cổng 8088; lưu lượng được mã hóa bởi WireGuard.
- HTTPS Tailscale Serve sẽ thay thế khi quản trị tailnet bật tính năng Serve.
- Cổng web: `/student/`, `/admin/`, `/verify/`; API: `/api/`; tài liệu: `/docs`.
- PostgreSQL, Redis và Bitcoin Core do Docker Compose quản lý, chỉ bind localhost và có restart policy `unless-stopped`.

Lệnh vận hành:

```bash
systemctl --user status datn-blockcerts-backend datn-blockcerts-nginx
journalctl --user -u datn-blockcerts-backend -f
tailscale serve status
```
