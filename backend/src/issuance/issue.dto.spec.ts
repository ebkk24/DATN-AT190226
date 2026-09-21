import 'reflect-metadata';
import { validate } from 'class-validator';
import { IssueRequestDto } from './issue.dto';

describe('IssueRequestDto', () => {
  it('chấp nhận mã sinh viên và địa chỉ P2PKH regtest hợp lệ', async () => {
    const valid = Object.assign(new IssueRequestDto(), {
      studentCode: 'AT180001',
      pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    });
    expect(await validate(valid)).toHaveLength(0);
  });

  it('từ chối mã sinh viên và subject URI không hợp lệ', async () => {
    const invalid = Object.assign(new IssueRequestDto(), {
      studentCode: 'mã có khoảng trắng',
      pubkey: 'ecdsa-koblitz-pubkey:mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    });
    const errors = await validate(invalid);
    expect(errors.some((error) => error.property === 'studentCode')).toBe(true);
    expect(errors.some((error) => error.property === 'pubkey')).toBe(true);
  });
});
