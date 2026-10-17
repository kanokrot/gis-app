import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let document: Document;
  let view: Window | null;
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    document = TestBed.inject(DOCUMENT);
    view = document.defaultView;
    originalMatchMedia = view ? Object.getOwnPropertyDescriptor(view, 'matchMedia') : undefined;
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    try {
      document.defaultView?.localStorage.removeItem('theme');
    } catch {
      // Storage may be unavailable in the test environment.
    }
  });

  afterEach(() => {
    if (!view) return;
    if (originalMatchMedia) Object.defineProperty(view, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(view, 'matchMedia');
  });

  it('toggles the document class and persists the selected theme', () => {
    document.defaultView?.localStorage.setItem('theme', 'light');
    const theme = TestBed.inject(ThemeService);

    expect(theme.isDark()).toBe(false);
    theme.toggle();

    expect(theme.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.defaultView?.localStorage.getItem('theme')).toBe('dark');
  });

  it('uses light mode when matchMedia is unavailable and no theme is saved', () => {
    if (view) Object.defineProperty(view, 'matchMedia', { configurable: true, value: undefined });

    const theme = TestBed.inject(ThemeService);

    expect(theme.isDark()).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
