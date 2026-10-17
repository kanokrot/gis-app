import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-mark',
  standalone: true,
  imports: [RouterLink],
  template: `<a routerLink="/" aria-label="Home" class="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-semibold text-teal-400 shadow-sm transition hover:border-teal-500/40 hover:text-teal-300 dark:bg-zinc-900">K</a>`,
  host: { class: 'pointer-events-auto block h-10 w-10' },
})
export class HomeMarkComponent {}
