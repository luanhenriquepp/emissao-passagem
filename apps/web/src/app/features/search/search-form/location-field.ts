import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { locationLabel, suggestLocations, type LocationSuggestion } from '@milhas/contracts';

/**
 * Campo origem/destino com autocomplete local (dataset dos contratos).
 * `code` é o IATA/grupo selecionado (model two-way).
 */
@Component({
  selector: 'app-location-field',
  templateUrl: './location-field.html',
  styleUrl: './location-field.scss',
})
export class LocationField {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly code = model<string>('');
  readonly error = input<string | null>(null);

  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(0);
  readonly suggestions = computed<LocationSuggestion[]>(() => suggestLocations(this.query(), 8));
  readonly display = computed(() => (this.code() ? locationLabel(this.code()) : null));
  readonly inputValue = computed(() => {
    if (this.open()) return this.query();
    const d = this.display();
    return d ? `${d.city} (${this.code()})` : this.query();
  });

  private readonly inputEl = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  focus(): void {
    this.inputEl().nativeElement.focus();
  }

  onFocus(): void {
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
  }

  onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.open.set(true);
    if (this.code()) this.code.set('');
  }

  onBlur(): void {
    this.blurTimer = setTimeout(() => this.open.set(false), 160);
  }

  choose(s: LocationSuggestion): void {
    this.code.set(s.code);
    this.query.set('');
    this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.suggestions();
    if (!this.open() || list.length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.set((this.active() + 1) % list.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set((this.active() - 1 + list.length) % list.length);
        break;
      case 'Enter':
        event.preventDefault();
        this.choose(list[this.active()] ?? list[0]);
        break;
      case 'Escape':
        this.open.set(false);
        break;
      default:
        break;
    }
  }
}
