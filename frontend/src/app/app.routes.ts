import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Homepage } from './homepage/homepage';
import { Onboarding } from './onboarding/onboarding';
import { OnboardingState } from './onboarding/onboarding-state';

export const routes: Routes = [
    {path: '', component: Homepage, canActivate: [() => inject(OnboardingState).read() ? true : inject(Router).createUrlTree(['/onboarding'])]},
    {path: 'onboarding', component: Onboarding, canActivate: [(route) => inject(OnboardingState).read() && route.queryParamMap.get('edit') !== '1' ? inject(Router).createUrlTree(['/']) : true]}
];
