import { Pipe, PipeTransform } from '@angular/core';
import { dateBr, dateShort, durationLabel, formatBrl, hhmm } from './format';

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    return formatBrl(value);
  }
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(minutes: number | null | undefined): string {
    return durationLabel(minutes);
  }
}

@Pipe({ name: 'hhmm' })
export class HhmmPipe implements PipeTransform {
  transform(isoLocal: string | null | undefined): string {
    return hhmm(isoLocal);
  }
}

@Pipe({ name: 'dateShort' })
export class DateShortPipe implements PipeTransform {
  transform(iso: string | null | undefined, withYear = true): string {
    return dateShort(iso, withYear);
  }
}

@Pipe({ name: 'dateBr' })
export class DateBrPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return dateBr(iso);
  }
}
