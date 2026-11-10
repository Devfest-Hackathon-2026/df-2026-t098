import * as argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters, shared by signup, login and password reset. */
export const PASSWORD_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
