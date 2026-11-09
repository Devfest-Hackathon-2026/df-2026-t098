import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  host: { 'aria-hidden': 'true', '[class.compact]': 'compact()' },
  template: `
    <img class="dark" [src]="'/brand/' + asset + '-dark.svg'" alt="" />
    <img class="light" [src]="'/brand/' + asset + '-light.svg'" alt="" />
  `,
  styles: `
    :host {
      display: block;
      flex: none;
    }
    img {
      display: block;
      width: 5.2157em;
      height: auto;
    }
    :host(.compact) img {
      width: 1.14em;
    }
    img.light,
    :host-context([data-theme='light']) img.dark {
      display: none;
    }
    :host-context([data-theme='light']) img.light {
      display: block;
    }
  `,
})
export class Brand {
  readonly compact = input(false);

  protected get asset(): string {
    return this.compact() ? 'mark' : 'wordmark';
  }
}
