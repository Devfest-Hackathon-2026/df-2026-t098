import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = { login: jest.fn(), signup: jest.fn(), passwordLogin: jest.fn() };
  const controller = new AuthController(authService as unknown as AuthService);
  const response = { cookie: jest.fn() } as unknown as Response;
  const webRequest = { headers: { origin: 'http://localhost:4200' } } as unknown as Request;
  const original = {
    web: process.env.FRONTEND_URL,
    native: process.env.NATIVE_APP_ORIGINS,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:4200';
    process.env.NATIVE_APP_ORIGINS = 'capacitor://localhost,https://localhost';
  });

  afterAll(() => {
    if (original.web === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original.web;
    if (original.native === undefined) delete process.env.NATIVE_APP_ORIGINS;
    else process.env.NATIVE_APP_ORIGINS = original.native;
  });

  it.each([undefined, null, '', '   ', 42, {}])(
    'rejects an invalid authorization code without calling the service',
    async (code) => {
      await expect(controller.login(code, webRequest, response)).rejects.toBeInstanceOf(BadRequestException);
      expect(authService.login).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    },
  );

  it('passes a valid code to the service and returns the message', async () => {
    authService.login.mockResolvedValue({
      token: 'test-token',
      message: 'Login successful!',
    });

    await expect(controller.login('example-code', webRequest, response)).resolves.toEqual({
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
      await expect(controller.signup(signupData, webRequest, response)).resolves.toEqual({
        message: 'ok',
      });
      expect(response.cookie).toHaveBeenCalledWith(
        'access_token',
        'session-token',
        expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
      );
    });

    it.each(['capacitor://localhost', 'https://localhost'])(
      'returns the token in the body, without a cookie, to the native origin %s',
      async (origin) => {
        authService.signup.mockResolvedValue(result);
        authService.passwordLogin.mockResolvedValue(result);
        authService.login.mockResolvedValue(result);
        const request = { headers: { origin } } as unknown as Request;
        const expected = { message: 'ok', token: 'session-token' };
        await expect(controller.signup(signupData, request, response)).resolves.toEqual(expected);
        await expect(
          controller.passwordLogin({ identifier: 'abc', password: 'x' }, request, response),
        ).resolves.toEqual(expected);
        await expect(controller.login('code', request, response)).resolves.toEqual(expected);
        expect(response.cookie).not.toHaveBeenCalled();
      },
    );

    it('treats a native origin as web when it is also the configured web origin', async () => {
      process.env.FRONTEND_URL = 'https://localhost';
      authService.signup.mockResolvedValue(result);
      const request = { headers: { origin: 'https://localhost' } } as unknown as Request;
      await expect(controller.signup(signupData, request, response)).resolves.toEqual({
        message: 'ok',
      });
      expect(response.cookie).toHaveBeenCalled();
    });

    it('falls back to the cookie when no native origins are configured', async () => {
      delete process.env.NATIVE_APP_ORIGINS;
      authService.signup.mockResolvedValue(result);
      const request = { headers: { origin: 'capacitor://localhost' } } as unknown as Request;
      await expect(controller.signup(signupData, request, response)).resolves.toEqual({
        message: 'ok',
      });
      expect(response.cookie).toHaveBeenCalled();
    });
  });
});
