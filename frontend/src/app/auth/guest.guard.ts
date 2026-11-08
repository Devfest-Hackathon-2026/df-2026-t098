import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import { AuthSession } from './auth-session';
import { questionReturnTo } from './auth-return';

export const guestOnlyGuard: CanActivateFn = async (route) => {
  const session = inject(AuthSession);
  const router = inject(Router);

  await session.refresh();
  if (session.status() !== 'authenticated') return true;
  const destination = questionReturnTo(route.queryParamMap?.get('returnTo'));
  return destination ? router.parseUrl(destination) : router.createUrlTree(['/']);
};
