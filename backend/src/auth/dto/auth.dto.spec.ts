import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PasswordLoginDto } from './password-login.dto';
import { SignupDto } from './signup.dto';
import { UsernameDto } from './username.dto';

describe('Password authentication DTOs', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validSignup = {
    email: 'learner@example.test',
    username: 'learner_1',
    password: 'long demo passphrase',
  };

  it('trims account identifiers without altering the password', async () => {
    const password = '  long demo passphrase  ';
    const signup = await pipe.transform(
      {
        email: '  learner@example.test  ',
        username: '  学習者_1  ',
        password,
      },
      { type: 'body', metatype: SignupDto },
    );

    expect(signup.email).toBe('learner@example.test');
    expect(signup.username).toBe('学習者_1');
    expect(signup.password).toBe(password);

    const login = await pipe.transform(
      { identifier: '  learner@example.test  ', password: ' ' },
      {
        type: 'body',
        metatype: PasswordLoginDto,
      },
    );
    expect(login.identifier).toBe('learner@example.test');
    expect(login.password).toBe(' ');
  });

  it('shares trimmed Unicode username validation with the authenticated profile action', async () => {
    await expect(pipe.transform({ username: '  学習者_1  ' }, { type: 'body', metatype: UsernameDto }))
      .resolves.toMatchObject({ username: '学習者_1' });
    for (const value of [undefined, null, '', 'ab', 'a'.repeat(33), 'name@example.test', 'two names']) {
      await expect(pipe.transform({ username: value }, { type: 'body', metatype: UsernameDto })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(pipe.transform({ username: 'learner', id: 'another-user' }, { type: 'body', metatype: UsernameDto }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { ...validSignup, email: 'not-an-email' },
    { ...validSignup, username: 'ab' },
    { ...validSignup, username: 'name@example.test' },
    { ...validSignup, password: 'short' },
    { ...validSignup, password: 'a'.repeat(129) },
    { email: validSignup.email, username: validSignup.username },
    { ...validSignup, unexpected: true },
  ])('rejects invalid or unexpected signup fields', async (input) => {
    await expect(
      pipe.transform(input, { type: 'body', metatype: SignupDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { identifier: ' ', password: 'password' },
    { identifier: 'learner', password: '' },
    { identifier: 'learner', password: 'x'.repeat(129) },
    { identifier: 'learner' },
  ])('rejects invalid password login fields', async (input) => {
    await expect(
      pipe.transform(input, { type: 'body', metatype: PasswordLoginDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
