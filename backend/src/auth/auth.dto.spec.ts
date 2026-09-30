import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './auth.dto';

describe('RegisterDto', () => {
  const base = { username: 'maker01', role: 'maker' };

  it('từ chối mật khẩu tạo tài khoản ngắn hơn 12 ký tự', async () => {
    const errors = await validate(plainToInstance(RegisterDto, { ...base, password: 'short123' }));
    expect(errors.some((item) => item.property === 'password')).toBe(true);
  });

  it('chấp nhận mật khẩu tạo tài khoản từ 12 ký tự', async () => {
    const errors = await validate(plainToInstance(RegisterDto, { ...base, password: 'correct-horse-1' }));
    expect(errors).toHaveLength(0);
  });
});
