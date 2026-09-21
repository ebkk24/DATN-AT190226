#!/usr/bin/env python3
import json
import os
import tempfile
from datetime import datetime, timezone

from bitcoin.core import CTransaction, b2lx
from pycoin.encoding.hexbytes import h2b
from cert_issuer import config
from cert_issuer.blockchain_handlers import bitcoin

CHECKPOINT = os.environ['DATN_ANCHOR_CHECKPOINT']
MODE = os.environ.get('DATN_ISSUER_MODE', 'issue')
EXPECTED_TXID = os.environ.get('DATN_EXPECTED_TXID')
EXPECTED_ROOT = os.environ.get('DATN_EXPECTED_MERKLE_ROOT')


def atomic_write(data):
    directory = os.path.dirname(CHECKPOINT)
    os.makedirs(directory, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix='.anchor-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, CHECKPOINT)
        dir_fd = os.open(directory, os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def main():
    app_config = config.get_config()
    batch_handler, transaction_handler, _ = bitcoin.instantiate_blockchain_handlers(app_config)
    batch_handler.pre_batch_actions(app_config)

    if MODE == 'recover':
        blockchain_bytes = batch_handler.prepare_batch()
        merkle_root = blockchain_bytes.hex().lower()
        if not EXPECTED_ROOT or merkle_root != EXPECTED_ROOT.lower():
            raise RuntimeError('Merkle root khi reconciliation không khớp checkpoint')
        if not EXPECTED_TXID:
            raise RuntimeError('Thiếu txid để reconciliation')
        batch_handler.finish_batch(EXPECTED_TXID, app_config.chain)
        batch_handler.post_batch_actions(app_config)
        return

    # Issuer.issue() tự gọi prepare_batch đúng một lần. Bắt root tại ranh giới
    # issue_transaction để checkpoint luôn trùng OP_RETURN thực sự.
    root_holder = {}
    original_issue_transaction = transaction_handler.issue_transaction
    original_broadcast = transaction_handler.broadcast_transaction

    def checkpointing_issue_transaction(blockchain_bytes):
        root_holder['merkleRoot'] = blockchain_bytes.hex().lower()
        return original_issue_transaction(blockchain_bytes)

    def checkpoint_then_broadcast(signed_tx):
        merkle_root = root_holder.get('merkleRoot')
        if not merkle_root:
            raise RuntimeError('Chưa checkpoint Merkle root trước broadcast')
        raw_transaction = signed_tx.as_hex()
        parsed = CTransaction.deserialize(h2b(raw_transaction))
        txid = b2lx(parsed.GetTxid()).lower()
        checkpoint = {
            'version': 1,
            'anchorTxid': txid,
            'merkleRoot': merkle_root,
            'rawTransaction': raw_transaction.lower(),
            'preparedAt': datetime.now(timezone.utc).isoformat(),
        }
        atomic_write(checkpoint)
        if os.environ.get('DATN_FAIL_BEFORE_BROADCAST') == '1':
            raise RuntimeError('DATN_FAULT_INJECTION_BEFORE_BROADCAST')
        result = original_broadcast(signed_tx)
        if result.lower() != txid:
            raise RuntimeError('Txid broadcast không khớp raw transaction đã checkpoint')
        checkpoint['broadcastReturnedAt'] = datetime.now(timezone.utc).isoformat()
        atomic_write(checkpoint)
        if os.environ.get('DATN_FAIL_AFTER_BROADCAST') == '1':
            raise RuntimeError('DATN_FAULT_INJECTION_AFTER_BROADCAST')
        return result

    transaction_handler.issue_transaction = checkpointing_issue_transaction
    transaction_handler.broadcast_transaction = checkpoint_then_broadcast
    transaction_handler.ensure_balance()
    from cert_issuer.issuer import Issuer
    issuer = Issuer(batch_handler, transaction_handler, max_retry=1)
    txid = issuer.issue(app_config.chain)
    batch_handler.post_batch_actions(app_config)
    print(json.dumps({'txid': txid, 'merkleRoot': root_holder['merkleRoot']}))


if __name__ == '__main__':
    main()
