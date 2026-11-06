import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import { AuthSession } from './auth-session';

export const guestOnlyGuard: CanActivateFn = async () => {
  const session = inject(AuthSession);
  const router = inject(Router);

  await session.refresh();
  return session.status() === 'authenticated' ? router.createUrlTree(['/']) : true;
};
