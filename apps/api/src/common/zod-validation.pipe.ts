import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida body/query com um schema zod; ZodError vira VALIDATION_ERROR no filtro. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value ?? {});
  }
}
