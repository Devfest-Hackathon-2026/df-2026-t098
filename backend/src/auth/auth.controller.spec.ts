import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = { login: jest.fn() };
  const controller = new AuthController(authService as unknown as AuthService);
  const response = { cookie: jest.fn() } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([undefined, null, '', '   ', 42, {}])(
    'rejects an invalid authorization code without calling the service',
    async (code) => {
      await expect(controller.login(code, response)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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
});
