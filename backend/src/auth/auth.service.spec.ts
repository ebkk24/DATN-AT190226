jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
import { AuthService } from './auth.service';

describe('AuthService register', () => {
  it('lưu thống nhất toàn bộ hồ sơ Student cho mọi endpoint gọi register', async () => {
    const users = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => ({ id: 'student-id', ...value })),
      save: jest.fn(async (value) => value),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      users as never,
      {} as never,
      audit as never,
    );

    const result = await service.register(
      {
        username: 'student01',
        password: 'password-strong',
        role: 'student',
        recipientName: ' Nguyễn Văn A ',
        studentCode: ' at190001 ',
        dateOfBirth: '2004-03-27',
        email: ' STUDENT@EXAMPLE.COM ',
        cohort: '2022 - 2027',
      },
      'checker01',
    );

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: 'Nguyễn Văn A',
        studentCode: 'AT190001',
        dateOfBirth: '2004-03-27',
        email: 'student@example.com',
        cohort: '2022 - 2027',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        studentCode: 'AT190001',
        dateOfBirth: '2004-03-27',
        email: 'student@example.com',
        cohort: '2022 - 2027',
      }),
    );
  });
});
