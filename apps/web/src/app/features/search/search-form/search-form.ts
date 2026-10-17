import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { Router } from '@angular/router';
import {
  buildSearchPath,
  isKnownLocation,
  maxOutboundDateIso,
  todayIsoSaoPaulo,
  type SearchCabin,
  type SearchRouteParams,
  type TripType,
} from '@milhas/contracts';
import { RecentSearchesService } from '../../../core/recent-searches.service';
import { LocationField } from './location-field';

type FieldKey = 'origin' | 'destination' | 'ida' | 'volta' | 'pax';

export const CABIN_OPTIONS: { value: SearchCabin; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ECONOMY', label: 'Econômica' },
  { value: 'BUSINESS', label: 'Executiva' },
];

@Component({
  selector: 'app-search-form',
  imports: [LocationField],
  templateUrl: './search-form.html',
  styleUrl: './search-form.scss',
})
export class SearchForm {
  /** Valores iniciais (página de resultados → "Modificar"). */
  readonly initial = input<SearchRouteParams | null>(null);
  readonly compact = input(false);
  readonly submitted = output<SearchRouteParams>();

  private readonly router = inject(Router);
  private readonly recent = inject(RecentSearchesService);

  readonly today = todayIsoSaoPaulo();
  readonly maxDate = maxOutboundDateIso();
  readonly cabins = CABIN_OPTIONS;

  readonly type = signal<TripType>('RT');
  readonly origin = signal('');
  readonly destination = signal('');
  readonly ida = signal('');
  readonly volta = signal('');
  readonly adt = signal(1);
  readonly chd = signal(0);
  readonly inf = signal(0);
  readonly cabin = signal<SearchCabin>('ALL');
  readonly paxOpen = signal(false);
  readonly errors = signal<Partial<Record<FieldKey, string>>>({});

  readonly totalPax = computed(() => this.adt() + this.chd() + this.inf());
  readonly paxLabel = computed(() => {
    const parts: string[] = [];
    parts.push(`${this.adt()} adulto${this.adt() === 1 ? '' : 's'}`);
    if (this.chd()) parts.push(`${this.chd()} criança${this.chd() === 1 ? '' : 's'}`);
    if (this.inf()) parts.push(`${this.inf()} bebê${this.inf() === 1 ? '' : 's'}`);
    return parts.join(', ');
  });
  readonly cabinLabel = computed(() => this.cabins.find((c) => c.value === this.cabin())?.label ?? 'Todas');

  private readonly originField = viewChild.required<LocationField>('originField');
  private readonly destinationField = viewChild.required<LocationField>('destinationField');
  private readonly dateInputs = viewChildren<ElementRef<HTMLInputElement>>('dateInput');

  constructor() {
    effect(() => {
      const init = this.initial();
      if (!init) return;
      this.type.set(init.type);
      this.origin.set(init.origin);
      this.destination.set(init.destination);
      this.ida.set(init.outbound_date);
      this.volta.set(init.return_date ?? '');
      this.adt.set(init.passengers.adt);
      this.chd.set(init.passengers.chd);
      this.inf.set(init.passengers.inf);
      this.cabin.set(init.cabin);
    });
  }

  setType(type: TripType): void {
    this.type.set(type);
    if (type === 'OW') this.volta.set('');
    this.clearError('volta');
  }

  swap(): void {
    const o = this.origin();
    this.origin.set(this.destination());
    this.destination.set(o);
  }

  setIda(value: string): void {
    this.ida.set(value);
    if (this.volta() && this.volta() < value) this.volta.set(value);
    this.clearError('ida');
  }

  setVolta(value: string): void {
    this.volta.set(value);
    this.clearError('volta');
  }

  step(kind: 'adt' | 'chd' | 'inf', delta: number): void {
    const target = kind === 'adt' ? this.adt : kind === 'chd' ? this.chd : this.inf;
    const next = target() + delta;
    if (next < 0 || next > 9) return;
    if (kind === 'adt' && next < 1) return;
    if (this.totalPax() + delta > 9) return;
    if (kind === 'inf' && next > this.adt()) return;
    if (kind === 'adt' && next < this.inf()) return;
    target.set(next);
    this.clearError('pax');
  }

  canStep(kind: 'adt' | 'chd' | 'inf', delta: number): boolean {
    const current = kind === 'adt' ? this.adt() : kind === 'chd' ? this.chd() : this.inf();
    const next = current + delta;
    if (next < 0 || next > 9) return false;
    if (kind === 'adt' && next < 1) return false;
    if (delta > 0 && this.totalPax() >= 9) return false;
    if (kind === 'inf' && next > this.adt()) return false;
    if (kind === 'adt' && next < this.inf()) return false;
    return true;
  }

  submit(event?: Event): void {
    event?.preventDefault();
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!this.origin() || !isKnownLocation(this.origin())) errors.origin = 'Informe a origem';
    if (!this.destination() || !isKnownLocation(this.destination())) errors.destination = 'Informe o destino';
    if (this.origin() && this.origin() === this.destination()) errors.destination = 'Origem e destino devem ser diferentes';
    if (!this.ida()) errors.ida = 'Selecione a data de ida';
    else if (this.ida() < this.today) errors.ida = 'Data de ida não pode ser no passado';
    else if (this.ida() > this.maxDate) errors.ida = 'Data de ida muito distante (máx. 1 ano + 1 mês)';
    if (this.type() === 'RT') {
      if (!this.volta()) errors.volta = 'Selecione a data de volta';
      else if (this.volta() < this.ida()) errors.volta = 'Volta não pode ser antes da ida';
    }
    if (this.totalPax() < 1 || this.totalPax() > 9) errors.pax = 'Total de passageiros deve ser entre 1 e 9';
    if (this.inf() > this.adt()) errors.pax = 'Cada bebê precisa de um adulto acompanhante';
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.focusFirstError(errors);
      return;
    }
    const params: SearchRouteParams = {
      type: this.type(),
      origin: this.origin(),
      destination: this.destination(),
      outbound_date: this.ida(),
      return_date: this.type() === 'RT' ? this.volta() : null,
      passengers: { adt: this.adt(), chd: this.chd(), inf: this.inf() },
      cabin: this.cabin(),
    };
    this.recent.add(params);
    this.submitted.emit(params);
    void this.router.navigateByUrl(buildSearchPath(params));
  }

  private clearError(key: FieldKey): void {
    if (!this.errors()[key]) return;
    const next = { ...this.errors() };
    delete next[key];
    this.errors.set(next);
  }

  private focusFirstError(errors: Partial<Record<FieldKey, string>>): void {
    if (errors.origin) {
      this.originField().focus();
      return;
    }
    if (errors.destination) {
      this.destinationField().focus();
      return;
    }
    const dates = this.dateInputs();
    if (errors.ida && dates[0]) {
      dates[0].nativeElement.focus();
      return;
    }
    if (errors.volta && dates[1]) {
      dates[1].nativeElement.focus();
      return;
    }
    if (errors.pax) this.paxOpen.set(true);
  }
}
