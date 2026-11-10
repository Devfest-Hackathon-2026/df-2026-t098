import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AUTH_FETCH } from './auth/auth-session';
import { DisplaySettings } from './learning/display-settings';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => inject(DisplaySettings).resolveDefaultLanguage(inject(AUTH_FETCH))),
    provideRouter(routes),
  ],
};
