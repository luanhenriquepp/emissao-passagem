import { Controller, Get } from '@nestjs/common';

/** Mesmo contrato do original: GET /api/health → { ok, service }. */
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'emissao-api' };
  }
}
