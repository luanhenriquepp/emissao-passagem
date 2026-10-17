import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecentSearchesService, type RecentSearch } from '../../core/recent-searches.service';
import { SearchForm } from '../search/search-form/search-form';
import { dateShort } from '../../shared/format';

@Component({
  selector: 'app-home-page',
  imports: [SearchForm, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  readonly recent = inject(RecentSearchesService);

  pathOf(item: RecentSearch): string {
    return this.recent.pathOf(item);
  }

  dates(item: RecentSearch): string {
    return item.volta ? `${dateShort(item.ida, false)} – ${dateShort(item.volta)}` : dateShort(item.ida);
  }

  pax(item: RecentSearch): number {
    return item.pax.adt + item.pax.chd + item.pax.inf;
  }
}
