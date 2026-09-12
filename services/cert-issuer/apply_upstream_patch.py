from pathlib import Path
import cert_issuer.blockchain_handlers.bitcoin.signer as signer

p = Path(signer.__file__)
text = p.read_text()
old = "lookup = build_hash160_lookup([secret_exponent])"
new = "lookup = build_hash160_lookup([secret_exponent], [network.generator])"
if text.count(old) != 1:
    raise SystemExit(f"Không áp dụng được bản vá pycoin một cách an toàn: {p}")
p.write_text(text.replace(old, new))
print(f"Đã áp dụng bản vá tương thích pycoin tại {p}")
