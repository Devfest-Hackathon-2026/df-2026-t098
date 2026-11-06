# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

The development server forwards `/api` requests to the backend on `127.0.0.1:3000`. Start the backend separately to use Google sign-in and account restoration. The sign-in page is `/login`; the local Google OAuth redirect must be registered as `http://localhost:4200/auth/google/callback`.

The backend's HttpOnly cookie maintains the session; the frontend reloads the profile from `/api/v1/auth/me` and does not save tokens in browser storage. The current Google flow is enabled only on `http://localhost:4200`. Native sign-in, backend-bound OAuth state and PKCE, CSRF protection, and deployment routing still need to be completed and tested before release.

The Profile account section displays the returned `avatarUrl`, with an icon
fallback for a missing or failed image. Its Sign out / ログアウト button calls
`POST /api/v1/auth/logout` with the session cookie; a confirmed response shows the
guest account panel. Pending requests disable the button, and failures offer a
retry without claiming logout succeeded. Local learning preferences and progress
are retained. Google avatar refresh is handled by the backend on the next Google
login, including accounts whose stored avatar is currently NULL.

`/signup` creates an account with email, username and password. The login form
now accepts email or username with that password. Both pages recheck the session
and redirect authenticated users to the app. Signup requires a 15–128-character
password and a unique 3–32-character username; passwords are never trimmed.

Google users can skip the optional username field on the final onboarding step
and set it later in Profile. A supplied onboarding username is saved before
learning starts. The Profile editor appears only while the account has no name;
a saved username is shown as `@username`. Setup uses the authenticated
`PATCH /api/v1/auth/me/username` endpoint and the existing unique-name rules.

`/login` rechecks the session and redirects authenticated users to `/` (or onboarding when required). If the session cannot be checked, the page offers a retry rather than assuming the user is signed out. The Google callback remains accessible long enough to validate and consume its one-time state and code. This frontend guard controls navigation only; protected backend endpoints must still verify the session.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
