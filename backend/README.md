<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## WhyLint authentication

Set `DB_URL`, `JWT_SECRET` (at least 32 characters), `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in your local `.env`. The frontend URL must match the browser origin, for example `http://localhost:4200`. Never commit real credentials.

Run the migrations with `npm run migration:run` before starting the server. The password/session migration preserves existing Google users and refuses to silently merge duplicate emails. Existing JWTs without a session ID must sign in again.

All paths below use the `/api/v1` prefix:

| Method | Path | JSON body | Result |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ "code": "..." }` | Existing Google authorization-code login |
| POST | `/auth/signup` | `{ "email": "...", "username": "...", "password": "..." }` | Create an account and session |
| POST | `/auth/password/login` | `{ "identifier": "...", "password": "..." }` | Sign in with email or username |
| GET | `/auth/me` | — | Return the current user profile, including nullable `username` |
| PATCH | `/auth/me/username` | `{ "username": "..." }` | Set the authenticated user's missing username |
| POST | `/auth/logout` | — | Revoke the current session and clear its cookie |

Login and signup set an HttpOnly `access_token` cookie; tokens and password hashes are not returned in JSON. Browser POST and PATCH requests must send the configured `Origin`; the login and signup bodies must be JSON. Usernames are 3–32 letters/numbers/`.`/`_`/`-` with no `@`. Passwords are 15–128 characters and are not trimmed. Login errors do not distinguish an unknown account from an incorrect password.

Google users can skip username setup during onboarding and set it later in Profile. Username setup uses the authenticated subject, only fills a missing username, and shares signup validation and the normalized unique index. Retrying the same owned name is idempotent; unavailable or replacement names return 409. The public profile is `{id,email,name,avatarUrl,username}`. No migration is needed for this extension.

Google display names and pictures are saved separately from the chosen username. Google login refreshes changed/missing profile metadata from the verified ID token, or uses the short-timeout UserInfo fallback when either field is omitted. UserInfo metadata is accepted only for the same verified Google subject. Missing optional fields preserve existing values. A fresh Google sign-in can backfill older NULL names; this does not change a chosen username.

JWT verification and its guard live in `src/auth/jwt/`; the session entity and service live in `src/auth/sessions/`. `JwtService.verifyAsync` checks the signature and expiry, and the guard also checks the database session so logout can revoke a token immediately, before its seven-day expiry.

Email ownership is not verified yet. Do not automatically link password and Google identities by email. Email verification and recovery, Google OAuth PKCE/state, distributed rate limiting, native app sign-in, and deployed cookie/CORS settings are not production-ready.

The PostgreSQL integration test needs an empty local `whylint_auth_e2e_*` test database through `TEST_DATABASE_URL`; it skips when this variable is absent and refuses other database names or non-local hosts. Never point tests at your development database.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
