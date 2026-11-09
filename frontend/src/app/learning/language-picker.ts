import { Component, ElementRef, inject, input, output } from '@angular/core';
import type { Language } from './learning.types';

@Component({
  selector: 'app-language-picker',
  templateUrl: './language-picker.html',
  styleUrl: './language-picker.css',
})
export class LanguagePicker {
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly language = input<Language>('ja');
  readonly selected = input<Language>('ja');
  readonly disabled = input(false);
  readonly changed = output<Language>();

  restoreSelection(language: Language): void {
    // The save can fail before Angular paints the new selection.
    for (const input of this.element.nativeElement.querySelectorAll<HTMLInputElement>('input')) {
      input.checked = input.value === language;
    }
  }
}
