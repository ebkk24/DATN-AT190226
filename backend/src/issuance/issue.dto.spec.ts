import 'reflect-metadata';
import { validate } from 'class-validator';
import { IssueRequestDto } from './issue.dto';

describe('IssueRequestDto', () => {
  it('chấp nhận địa chỉ P2PKH regtest và từ chối subject URI đầu vào', async () => {
    const valid = Object.assign(new IssueRequestDto(), {
      recipientName: 'Sinh viên kiểm thử',
      pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    });
    expect(await validate(valid)).toHaveLength(0);

    const invalid = Object.assign(new IssueRequestDto(), {
      recipientName: 'Sinh viên kiểm thử',
      pubkey: 'ecdsa-koblitz-pubkey:mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    });
    expect(
      (await validate(invalid)).some((error) => error.property === 'pubkey'),
    ).toBe(true);
  });
});
