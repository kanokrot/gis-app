import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UsesPage } from './uses-page';

describe('UsesPage', () => {
  let component: UsesPage;
  let fixture: ComponentFixture<UsesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsesPage],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(UsesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the listed tool categories and dependency versions', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('npm ls --depth=0');
    expect(text).toContain('@angular/core@^21.0.0');
    expect(text).toContain('ArcGIS Online');
    expect(text).toContain('Windows');
    expect(text).toContain('Medium');
    expect(fixture.nativeElement.querySelectorAll('main section article').length).toBe(4);
  });
});
