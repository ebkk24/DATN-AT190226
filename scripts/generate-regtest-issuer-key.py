#!/usr/bin/env python3
"""Sinh khóa secp256k1 và địa chỉ P2PKH regtest mà không in private key.

Chỉ dùng thư viện chuẩn Python. WIF được ghi bằng thao tác tạo mới độc quyền và quyền 0600.
Script từ chối ghi đè để tránh vô tình thay khóa của môi trường đang chạy.
"""
import argparse
import hashlib
import os
import secrets
from pathlib import Path

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x1, y1 = a
    x2, y2 = b
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if a == b:
        slope = (3 * x1 * x1) * pow(2 * y1, P - 2, P) % P
    else:
        slope = (y2 - y1) * pow((x2 - x1) % P, P - 2, P) % P
    x3 = (slope * slope - x1 - x2) % P
    return x3, (slope * (x1 - x3) - y1) % P


def scalar_multiply(k, point=G):
    result = None
    addend = point
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def base58check(payload: bytes) -> str:
    raw = payload + sha256(sha256(payload))[:4]
    value = int.from_bytes(raw, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = ALPHABET[remainder] + encoded
    return "1" * (len(raw) - len(raw.lstrip(b"\0"))) + encoded


def derive(private_key: bytes):
    scalar = int.from_bytes(private_key, "big")
    if not 1 <= scalar < N:
        raise ValueError("private key ngoài miền secp256k1")
    x, y = scalar_multiply(scalar)
    public_key = bytes([2 + (y & 1)]) + x.to_bytes(32, "big")
    public_hash = hashlib.new("ripemd160", sha256(public_key)).digest()
    # 0xef: WIF testnet/regtest; 0x6f: địa chỉ P2PKH testnet/regtest; 0x01: khóa nén.
    wif = base58check(b"\xef" + private_key + b"\x01")
    address = base58check(b"\x6f" + public_hash)
    return wif, address


def exclusive_write(path: Path, value: str, mode: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        os.write(fd, (value + "\n").encode("ascii"))
        os.fsync(fd)
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wif-output", default="storage/credentials/pk_issuer.txt")
    parser.add_argument("--address-output", default="storage/credentials/issuing-address.txt")
    args = parser.parse_args()
    wif_path = Path(args.wif_output)
    address_path = Path(args.address_output)
    if wif_path.exists() or address_path.exists():
        raise SystemExit("Từ chối ghi đè khóa/địa chỉ hiện có; hãy chọn đường dẫn mới hoặc sao lưu thủ công.")
    while True:
        private_key = secrets.token_bytes(32)
        if 1 <= int.from_bytes(private_key, "big") < N:
            break
    wif, address = derive(private_key)
    exclusive_write(wif_path, wif, 0o600)
    try:
        exclusive_write(address_path, address, 0o644)
    except Exception:
        wif_path.unlink(missing_ok=True)
        raise
    print(f"Đã ghi WIF với quyền 0600 vào: {wif_path}")
    print(f"Địa chỉ phát hành công khai: {address}")
    print(f"Đã ghi địa chỉ vào: {address_path}")


if __name__ == "__main__":
    main()
