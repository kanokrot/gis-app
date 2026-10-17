import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly dark = signal(this.initialTheme());
  readonly isDark = this.dark.asReadonly();

  constructor() {
    this.apply(this.isDark());
  }

  toggle(): void {
    this.dark.update((isDark) => !isDark);
    const isDark = this.isDark();
    this.apply(isDark);
    try {
      this.document.defaultView?.localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }

  private initialTheme(): boolean {
    const view = this.document.defaultView;
    let savedTheme: string | null = null;
    try {
      savedTheme = view?.localStorage.getItem('theme') ?? null;
    } catch {
      // Fall back to the system preference when storage is unavailable.
    }

    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;

    try {
      return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  }

  private apply(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark', isDark);
    this.document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }
}
