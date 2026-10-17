import { DestroyRef, computed, inject, signal, type Signal } from '@angular/core';

/** Contagem regressiva (em segundos) até um instante ISO (UTC). Deve ser criada em contexto de injeção. */
export function createCountdown(expiresAt: Signal<string | null | undefined>) {
  const destroyRef = inject(DestroyRef);
  const now = signal(Date.now());
  const timer = setInterval(() => now.set(Date.now()), 1000);
  destroyRef.onDestroy(() => clearInterval(timer));

  const remaining = computed(() => {
    const at = expiresAt();
    if (!at) return null;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.floor((ms - now()) / 1000));
  });
  const expired = computed(() => remaining() === 0);
  const label = computed(() => {
    const s = remaining();
    if (s === null) return '';
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  return { remaining, expired, label };
}
