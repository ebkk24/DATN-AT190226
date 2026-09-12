from cert_issuer import config

cfg = config.get_config("/workspace/config/real-preflight.ini")
from cert_issuer.blockchain_handlers.bitcoin.connectors import BitcoindConnector

def block_broadcast(self, transaction):
    print("Giao dịch đã ký và xác minh; broadcast bị chặn có chủ ý")
    return "00" * 32

BitcoindConnector.broadcast_tx = block_broadcast
from cert_issuer import issue_certificates
issue_certificates.main(cfg)
