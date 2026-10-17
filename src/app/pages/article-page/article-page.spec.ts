import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ArticleService } from './article-service';
import { ArticlePage } from './article-page';
import articlesData from '../../data/articles.json';

describe('ArticlePage', () => {
  let component: ArticlePage;
  let fixture: ComponentFixture<ArticlePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticlePage],
      providers: [
        provideRouter([]),
        { provide: ArticleService, useValue: { getReviews: () => of([]), insertReview: () => of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArticlePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('creates and renders articles from the JSON data', () => {
    expect(component).toBeTruthy();
    expect(component.articles().length).toBe(articlesData.length);
    expect(fixture.nativeElement.textContent).toContain(articlesData[0].title);
  });

  it('filters articles by the selected tag', () => {
    const tag = articlesData[0].tags[0];
    component.selectTag(tag);
    fixture.detectChanges();

    expect(component.filteredArticles().every(article => article.tags.includes(tag))).toBe(true);
    expect(fixture.nativeElement.querySelector(`button[aria-pressed="true"]`)?.textContent.trim()).toBe(tag);
  });

  it('renders Medium links that open safely in a new tab', () => {
    const links: HTMLAnchorElement[] = [...fixture.nativeElement.querySelectorAll('a[href^="https://medium.com/"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
      expect(link.rel).toContain('noreferrer');
    }
  });
});
