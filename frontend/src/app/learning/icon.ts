import { Component, input } from '@angular/core';

const PATHS: Record<string, string> = {
  feed: 'M4 4h16v16H4zM8 9h8M8 13h5',
  review: 'M4 8a8 8 0 1 1 0 8M4 3v5h5',
  rank: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 13v6M8 21h8',
  publish: 'M12 5v14M5 12h14',
  profile: 'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 20a7 7 0 0 1 14 0',
  settings:
    'M10 3h4l.7 2.6 2 .9 2.4-.9 2 3.4-1.8 1.8v2.4l1.8 1.8-2 3.4-2.4-.9-2 .9L14 21h-4l-.7-2.6-2-.9-2.4.9-2-3.4 1.8-1.8v-2.4L2.9 9l2-3.4 2.4.9 2-.9L10 3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  like: 'M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z',
  comment: 'M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z',
  share: 'M12 16V3M7 8l5-5 5 5M5 13v7h14v-7',
  save: 'M6 3h12v18l-6-4-6 4V3Z',
  close: 'M6 6l12 12M6 18 18 6',
  send: 'M12 19V5M5 12l7-7 7 7',
  next: 'M6 9l6 6 6-6',
  previous: 'M6 15l6-6 6 6',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  moon: 'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM8 12.5l3 3 5-6',
  flame:
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z',
  bug: 'm8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6ZM12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4',
  target:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  sparkle:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16Z',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1L12 2Z',
  book: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2V3ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7V3Z',
  medal: 'M19 8a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM8.2 13.9 7 23l5-3 5 3-1.2-9.1',
  calendar:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'calendar-check':
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 16l2 2 4-4',
  pencil: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3ZM15 5l4 4',
  lightbulb:
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  'trend-up': 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3',
};

@Component({
  selector: 'app-icon',
  template: `<svg
    viewBox="0 0 24 24"
    [attr.fill]="filled() ? 'currentColor' : 'none'"
    aria-hidden="true"
  >
    <path [attr.d]="path" />
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
      }
      svg {
        width: 100%;
        height: 100%;
        stroke: currentColor;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `,
  ],
})
export class Icon {
  readonly name = input('feed');
  readonly filled = input(false);
  protected get path() {
    return PATHS[this.name()] ?? PATHS['feed'];
  }
}
