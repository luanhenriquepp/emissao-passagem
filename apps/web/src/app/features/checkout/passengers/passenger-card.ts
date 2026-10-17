import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  NAME_MAX,
  NAME_MIN,
  PASSPORT_REGEX,
  PAX_AGE_RANGES,
  ageAt,
  brDateToIso,
  isValidCpf,
  maskCpf,
  onlyDigits,
  type BaggagePricing,
  type DocumentType,
  type FavoritePassenger,
  type OrderPassenger,
  type OrderRequirements,
  type PassengerInputRaw,
  type PaxType,
} from '@milhas/contracts';
import { debounceTime } from 'rxjs';
import type { ApiError } from '../../../core/api-error';
import { dateBr } from '../../../shared/format';
import { PAX_TYPE_LABELS } from '../../../shared/labels';
import { BrlPipe } from '../../../shared/pipes';

/** Valores crus do formulário (rascunho salvo em localStorage). */
export interface PassengerDraft {
  nationality: string;
  document_type: DocumentType;
  document_number: string;
  first_name: string;
  last_name: string;
  /** DD/MM/AAAA */
  birth_date: string;
  gender: '' | 'M' | 'F';
  save_as_favorite: boolean;
  extra_baggage_outbound_qty: number;
  extra_baggage_return_qty: number;
}

export const NATIONALITIES: { code: string; label: string }[] = [
  { code: 'BR', label: 'Brasil' },
  { code: 'AR', label: 'Argentina' },
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colômbia' },
  { code: 'DE', label: 'Alemanha' },
  { code: 'ES', label: 'Espanha' },
  { code: 'FR', label: 'França' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'IT', label: 'Itália' },
  { code: 'JP', label: 'Japão' },
  { code: 'MX', label: 'México' },
  { code: 'PE', label: 'Peru' },
  { code: 'PT', label: 'Portugal' },
  { code: 'PY', label: 'Paraguai' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'UY', label: 'Uruguai' },
];

const AGE_MESSAGES: Record<PaxType, string> = {
  ADT: 'Adulto precisa ter 12 anos ou mais na data do voo',
  CHD: 'Criança precisa ter entre 2 e 11 anos na data do voo',
  INF: 'Bebê precisa ter menos de 2 anos na data do voo',
};

@Component({
  selector: 'app-passenger-card',
  imports: [ReactiveFormsModule, BrlPipe],
  templateUrl: './passenger-card.html',
  styleUrl: './passenger-card.scss',
})
export class PassengerCard {
  readonly slot = input.required<OrderPassenger>();
  readonly index = input.required<number>();
  readonly requirements = input.required<OrderRequirements>();
  readonly baggagePricing = input.required<{ outbound: BaggagePricing; return: BaggagePricing | null }>();
  /** Data da ida (YYYY-MM-DD) usada na validação de idade. */
  readonly outboundDate = input.required<string>();
  readonly favorites = input<FavoritePassenger[]>([]);
  readonly draft = input<PassengerDraft | null>(null);
  readonly saving = input(false);
  readonly serverError = input<ApiError | null>(null);

  readonly save = output<PassengerInputRaw>();
  readonly changed = output<PassengerDraft>();

  private readonly fb = inject(FormBuilder).nonNullable;
  readonly nationalities = NATIONALITIES;
  readonly editing = signal(false);
  readonly submitted = signal(false);
  private draftApplied = false;
  private paxType: PaxType | null = null;
  private refDate = '';

  readonly form = this.fb.group({
    nationality: ['BR', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
    document_type: ['CPF' as DocumentType, Validators.required],
    document_number: ['', [Validators.required, (c: AbstractControl) => this.documentValidator(c)]],
    first_name: ['', [Validators.required, Validators.minLength(NAME_MIN), Validators.maxLength(NAME_MAX)]],
    last_name: ['', [Validators.required, Validators.minLength(NAME_MIN), Validators.maxLength(NAME_MAX)]],
    birth_date: ['', [Validators.required, (c: AbstractControl) => this.birthValidator(c)]],
    gender: ['' as '' | 'M' | 'F', Validators.required],
    save_as_favorite: [false],
    extra_baggage_outbound_qty: [0],
    extra_baggage_return_qty: [0],
  });

  readonly showForm = computed(() => !this.slot().is_complete || this.editing());
  readonly typeLabel = computed(() => PAX_TYPE_LABELS[this.slot().pax_type].singular);
  readonly ageHint = computed(() => {
    const t = this.slot().pax_type;
    return t === 'ADT' ? '12 anos ou mais' : t === 'CHD' ? '2 a 11 anos' : 'menos de 2 anos';
  });
  readonly allowedDocs = computed(() => this.requirements().document_types_allowed);
  readonly docType = signal<DocumentType>('CPF');
  readonly canBuyOutbound = computed(() => this.slot().pax_type !== 'INF' && this.baggagePricing().outbound.allow_extra_purchase);
  readonly canBuyReturn = computed(() => {
    const ret = this.baggagePricing().return;
    return this.slot().pax_type !== 'INF' && !!ret && ret.allow_extra_purchase;
  });
  readonly summaryLine = computed(() => {
    const s = this.slot();
    const parts = [`${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()];
    if (s.document_number_masked) parts.push(`${s.document_type === 'PASSPORT' ? 'Passaporte' : 'CPF'} ${s.document_number_masked}`);
    if (s.birth_date) parts.push(dateBr(s.birth_date));
    if (s.gender) parts.push(s.gender === 'M' ? 'Masculino' : 'Feminino');
    const extras = s.extra_baggage_outbound_qty + s.extra_baggage_return_qty;
    if (extras > 0) parts.push(`${extras} bagagem${extras > 1 ? 'ns' : ''} extra`);
    return parts.join(' · ');
  });

  constructor() {
    // Contexto de validação (tipo de passageiro / data do voo) e documento padrão.
    effect(() => {
      this.paxType = this.slot().pax_type;
      this.refDate = this.outboundDate();
      const preferred = this.requirements().preferred_document_type;
      const allowed = this.allowedDocs();
      if (!this.draftApplied && !this.form.controls.document_number.value) {
        const docType = allowed.includes(preferred) ? preferred : allowed[0] ?? 'CPF';
        this.form.controls.document_type.setValue(docType, { emitEvent: false });
        this.docType.set(docType);
      }
      this.form.controls.birth_date.updateValueAndValidity({ emitEvent: false });
    });

    // Rascunho salvo localmente (aplicado uma vez).
    effect(() => {
      const d = this.draft();
      if (!d || this.draftApplied) return;
      this.draftApplied = true;
      this.form.patchValue(d, { emitEvent: false });
      this.docType.set(d.document_type);
    });

    // Sai do modo edição quando o servidor confirmou o passageiro.
    effect(() => {
      if (this.slot().is_complete && !this.saving() && !this.serverError()) this.editing.set(false);
    });

    this.form.controls.document_type.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      this.docType.set(t);
      this.form.controls.document_number.setValue('', { emitEvent: false });
      this.form.controls.document_number.updateValueAndValidity({ emitEvent: false });
    });

    this.form.controls.nationality.valueChanges.pipe(takeUntilDestroyed()).subscribe((n) => {
      const allowed = this.allowedDocs();
      if (n !== 'BR' && allowed.includes('PASSPORT') && this.form.controls.document_type.value === 'CPF' && !this.form.controls.document_number.value) {
        this.form.controls.document_type.setValue('PASSPORT');
      }
    });

    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.changed.emit(this.form.getRawValue()));
  }

  onDocumentInput(raw: string): void {
    const value = this.docType() === 'CPF' ? maskCpf(raw) : raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    this.form.controls.document_number.setValue(value);
  }

  onBirthInput(raw: string): void {
    const d = onlyDigits(raw).slice(0, 8);
    let out = d;
    if (d.length > 4) out = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    else if (d.length > 2) out = `${d.slice(0, 2)}/${d.slice(2)}`;
    this.form.controls.birth_date.setValue(out);
  }

  applyFavorite(id: string): void {
    const f = this.favorites().find((x) => x.id === id);
    if (!f) return;
    const docType = this.allowedDocs().includes(f.document_type) ? f.document_type : this.form.controls.document_type.value;
    this.form.patchValue({
      first_name: f.first_name,
      last_name: f.last_name,
      birth_date: dateBr(f.birth_date),
      gender: f.gender,
      nationality: f.nationality || 'BR',
      document_type: docType,
      document_number: '',
    });
    this.docType.set(docType);
    this.form.controls.document_number.markAsUntouched();
  }

  stepBag(kind: 'outbound' | 'return', delta: number): void {
    const control = kind === 'outbound' ? this.form.controls.extra_baggage_outbound_qty : this.form.controls.extra_baggage_return_qty;
    const pricing = kind === 'outbound' ? this.baggagePricing().outbound : this.baggagePricing().return;
    const max = pricing?.max_extra_per_pax ?? 0;
    const next = control.value + delta;
    if (next < 0 || next > max) return;
    control.setValue(next);
  }

  errorOf(name: keyof PassengerDraft): string | null {
    const c = this.form.controls[name];
    if (!c.errors || !(c.touched || this.submitted())) return null;
    if (c.errors['required']) return 'Campo obrigatório';
    if (c.errors['minlength']) return `Mínimo de ${NAME_MIN} caracteres`;
    if (c.errors['maxlength']) return `Máximo de ${NAME_MAX} caracteres`;
    if (c.errors['pattern']) return 'Valor inválido';
    if (c.errors['cpf']) return 'CPF inválido';
    if (c.errors['passport']) return 'Passaporte inválido (6 a 12 letras/números)';
    if (c.errors['date']) return 'Data inválida (use DD/MM/AAAA)';
    if (c.errors['future']) return 'Data de nascimento no futuro';
    if (c.errors['age']) return String(c.errors['age']);
    return 'Valor inválido';
  }

  submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const birthIso = brDateToIso(v.birth_date);
    if (!birthIso || v.gender === '') return;
    this.save.emit({
      nationality: v.nationality,
      document_type: v.document_type,
      document_number: v.document_type === 'CPF' ? onlyDigits(v.document_number) : v.document_number.trim().toUpperCase(),
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      birth_date: birthIso,
      gender: v.gender,
      save_as_favorite: v.save_as_favorite,
      extra_baggage_outbound_qty: this.canBuyOutbound() ? v.extra_baggage_outbound_qty : 0,
      extra_baggage_return_qty: this.canBuyReturn() ? v.extra_baggage_return_qty : 0,
    });
  }

  private documentValidator(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '');
    if (!value) return null;
    const type = (control.parent?.get('document_type')?.value as DocumentType | undefined) ?? 'CPF';
    if (type === 'CPF') return isValidCpf(value) ? null : { cpf: true };
    return PASSPORT_REGEX.test(value.trim()) ? null : { passport: true };
  }

  private birthValidator(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '');
    if (!value) return null;
    const iso = brDateToIso(value);
    if (!iso) return { date: true };
    if (!this.paxType || !this.refDate) return null;
    if (iso > this.refDate) return { future: true };
    const age = ageAt(iso, this.refDate);
    const range = PAX_AGE_RANGES[this.paxType];
    if (age < range.min || age > range.max) return { age: AGE_MESSAGES[this.paxType] };
    return null;
  }
}
