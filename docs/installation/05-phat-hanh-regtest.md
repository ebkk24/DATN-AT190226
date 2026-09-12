# Phát hành chứng thư Blockcerts trên Bitcoin regtest

## Trạng thái trước khi phát hành

Chạy:

```bash
cd ~/DATN_work/datn-blockcerts
./scripts/setup-regtest-watch-wallet.sh
./scripts/preflight-cert-issuer.sh
```

Tiền kiểm tra dùng `mockchain`, không tạo giao dịch thật trên regtest.

## Phát hành thật

Lệnh sau sử dụng khóa phát hành, tạo Merkle root và broadcast một giao dịch regtest:

```bash
docker compose --profile tools run --rm cert-issuer
```

Chỉ chạy đúng một lần cho cùng thư mục đầu vào. Nếu kết quả broadcast mơ hồ hoặc tiến trình chết quanh thời điểm gửi giao dịch, không chạy lại ngay; trước hết đối soát mempool/khối theo Merkle root.

## Tạo block xác nhận

```bash
./scripts/mine-regtest-block.sh
```

## Kiểm tra đầu ra

```bash
find blockcerts/cert-issuer/blockchain_certificates -maxdepth 1 -type f -name '*.json' -print
python3 -m json.tool blockcerts/cert-issuer/blockchain_certificates/*.json | less
```

Chứng thư hoàn chỉnh phải có `proof`, `proofValue`, Merkle root và anchor chứa `txid`.

## Việc bắt buộc trước bản thực nghiệm cuối

URL `http://localhost:3000/...` hiện chỉ là profile phát triển. Sau khi NestJS API và HTTPS hoạt động, đổi issuer/profile/revocation URL sang URL công khai rồi tạo lại chứng thư; không dùng chứng thư localhost làm kết quả cuối.
