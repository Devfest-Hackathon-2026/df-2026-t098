import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  templateUrl: './loading-skeleton.html',
  styleUrl: './loading-skeleton.css',
})
export class LoadingSkeleton {
  readonly variant = input<'question' | 'list' | 'account' | 'profile' | 'form'>('list');
  readonly label = input('Loading…');
}
