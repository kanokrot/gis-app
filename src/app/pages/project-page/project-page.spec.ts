import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProjectPage } from './project-page';

describe('ProjectPage', () => {
  let component: ProjectPage;
  let fixture: ComponentFixture<ProjectPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectPage],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the featured demo and portfolio card without placeholder or source links', () => {
    const text = fixture.nativeElement.textContent;
    const cards = fixture.nativeElement.querySelectorAll('main article');
    expect(text).toContain('Projects & experiments.');
    expect(text).toContain('HouseBuy GIS demo');
    expect(text).toContain('Southern Thailand Flood Explorer');
    expect(text).toContain('This portfolio');
    expect(text).toContain('Rotatable 2D map with compass, scale bar and coordinate readout');
    expect(cards.length).toBe(3);
    expect(fixture.nativeElement.querySelector('a[href="/demo-gis"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/flood"]')?.textContent).toContain('Open the explorer →');
    expect(fixture.nativeElement.querySelector('main a[href^="https://github.com/"]')).toBeNull();
  });
});
