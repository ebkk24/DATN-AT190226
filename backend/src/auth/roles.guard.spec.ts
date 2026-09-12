import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const context = (role?: string) =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as any;

  it('cho phép route không khai báo role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    expect(
      new RolesGuard(reflector as unknown as Reflector).canActivate(context()),
    ).toBe(true);
  });

  it('từ chối khi route yêu cầu role nhưng chưa có user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['maker']),
    };
    expect(
      new RolesGuard(reflector as unknown as Reflector).canActivate(context()),
    ).toBe(false);
  });

  it('cho phép đúng role và chặn sai role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['checker']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(context('checker'))).toBe(true);
    expect(() => guard.canActivate(context('student'))).toThrow(
      ForbiddenException,
    );
  });
});
