import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { OnboardingState } from './onboarding/onboarding-state';
import { guestOnlyGuard } from './auth/guest.guard';

const learningGuard = async () => {
  const state = inject(OnboardingState);
  const router = inject(Router);
  return (await state.restore()) ? true : router.createUrlTree(['/onboarding']);
};

export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin').then((m) => m.AdminPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./google-login/google-login').then((m) => m.GoogleLogin),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'signup',
    loadComponent: () => import('./signup/signup').then((m) => m.Signup),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'auth/google/callback',
    loadComponent: () => import('./google-login/google-login').then((m) => m.GoogleLogin),
  },
  {
    path: 'terms',
    data: { kind: 'terms' },
    loadComponent: () => import('./legal/legal-page').then((m) => m.LegalPage),
  },
  {
    path: 'privacy',
    data: { kind: 'privacy' },
    loadComponent: () => import('./legal/legal-page').then((m) => m.LegalPage),
  },
  {
    path: 'questions/:id',
    loadComponent: () => import('./learning/shared-question').then((m) => m.SharedQuestion),
  },
  {
    path: 'creators/:id',
    loadComponent: () => import('./learning/creator-profile').then((m) => m.CreatorProfilePage),
  },
  {
    path: '',
    loadComponent: () => import('./homepage/homepage').then((m) => m.Homepage),
    canActivate: [learningGuard],
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./onboarding/onboarding').then((m) => m.Onboarding),
    canActivate: [
      async (route) => {
        const state = inject(OnboardingState);
        const router = inject(Router);
        if (route.queryParamMap.get('edit') === '1') return true;
        return (await state.restore()) ? router.createUrlTree(['/']) : true;
      },
    ],
  },
];
