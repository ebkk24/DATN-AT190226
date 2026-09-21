import 'reflect-metadata';
import { validate } from 'class-validator';
import { IssueRequestDto } from './issue.dto';

describe('IssueRequestDto', () => {
  it('chấp nhận mã sinh viên và địa chỉ P2PKH regtest hợp lệ', async () => {
    const valid = Object.assign(new IssueRequestDto(), {
      studentCode: 'AT180001',
      pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
      degreeName: 'Bằng tốt nghiệp đại học',
      major: 'An Toàn Thông Tin',
      educationLevel: 'Đại học',
      graduationRank: 'Giỏi',
      graduationYear: 2027,
      issueDate: '2027-06-30',
      diplomaNumber: 'KMA-2027-0001',
      trainingMode: 'Chính quy',
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
  it('từ chối ngày cấp không tồn tại và giá trị ngoài danh mục', async () => {
    const invalid = Object.assign(new IssueRequestDto(), {
      studentCode: 'AT180001',
      pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
      degreeName: 'Bằng tốt nghiệp đại học',
      major: 'An Toàn Thông Tin',
      educationLevel: 'Tiến sĩ tự do',
      graduationRank: 'Xuất sắc nhất',
      graduationYear: 2027,
      issueDate: '2027-02-30',
      diplomaNumber: 'KMA-2027-0001',
      trainingMode: 'Từ xa tùy chọn',
    });
    const properties = (await validate(invalid)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining(['educationLevel', 'graduationRank', 'issueDate', 'trainingMode']),
    );
  });

  it('từ chối payload thiếu các trường nghiệp vụ bắt buộc', async () => {
    const invalid = Object.assign(new IssueRequestDto(), {
      studentCode: 'AT180001',
      pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    });
    const properties = (await validate(invalid)).map((error) => error.property);
    expect(properties).toEqual(
      expect.arrayContaining([
        'degreeName', 'major', 'educationLevel', 'graduationRank',
        'graduationYear', 'issueDate', 'diplomaNumber', 'trainingMode',
      ]),
    );
  });

});
