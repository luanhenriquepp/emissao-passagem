import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Definidas aqui (e não no spec) porque os services leem o ambiente ao carregar o módulo.
    env: {
      AUTO_LOGIN: 'true',
      ISSUANCE_OUTCOME: 'booked',
      ISSUANCE_DELAY_MS: '200',
      DEPOSIT_AUTO_CONFIRM_SECONDS: '0',
      SEARCH_LIMIT_PER_WINDOW: '100',
    },
  },
});
