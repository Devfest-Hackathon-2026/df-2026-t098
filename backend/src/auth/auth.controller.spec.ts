import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    signup: jest.fn(),
    deleteAccount: jest.fn(),
  };
  const controller = new AuthController(authService as unknown as AuthService);
  const response = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, null, '', '   ', 42, {}])(
    'rejects an invalid authorization code without calling the service',
    async (code) => {
      await expect(controller.login(code, response)).rejects.toBeInstanceOf(BadRequestException);
      expect(authService.login).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    },
  );

  it('passes a valid code to the service and returns the message', async () => {
    authService.login.mockResolvedValue({
      token: 'test-token',
      message: 'Login successful!',
    });

    await expect(controller.login('example-code', response)).resolves.toEqual({
      message: 'Login successful!',
    });
    expect(authService.login).toHaveBeenCalledWith('example-code');
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      'test-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  describe('session delivery', () => {
    const result = { token: 'session-token', message: 'ok' };
    const signupData = { email: 'a@example.test', username: 'abc', password: 'x'.repeat(15) };

    it('keeps the web session in an HttpOnly cookie and never returns the token', async () => {
      authService.signup.mockResolvedValue(result);
      await expect(controller.signup(signupData, response)).resolves.toEqual({
        message: 'ok',
      });
      expect(response.cookie).toHaveBeenCalledWith(
        'access_token',
        'session-token',
        expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
      );
    });
  });
  describe('account deletion', () => {
    const request = { user: { sub: 'user-1', sid: 'session-1' } } as never;

    it('deletes the authenticated account and clears the web cookie', async () => {
      authService.deleteAccount.mockResolvedValue(undefined);
      await expect(controller.deleteAccount(request, response)).resolves.toBeUndefined();
      expect(authService.deleteAccount).toHaveBeenCalledWith('user-1');
      expect(response.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ httpOnly: true, secure: true }),
      );
    });

    it('refuses an unauthenticated request and keeps the cookie when deletion fails', async () => {
      await expect(controller.deleteAccount({} as never, response)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authService.deleteAccount).not.toHaveBeenCalled();
      authService.deleteAccount.mockRejectedValue(new Error('database unavailable'));
      await expect(controller.deleteAccount(request, response)).rejects.toThrow('database');
      expect(response.clearCookie).not.toHaveBeenCalled();
    });
  });
});
