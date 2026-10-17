import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import { ReviewItemComponent } from './components/review-item-component/review-item-component';
import { WriteReviewComponent } from './components/write-review-component/write-review-component';
import { ReviewSummaryComponent } from './components/review-summary-component/review-summary-component';
import { ArticleService } from './article-service';
import { Review } from './components/review-item-component/types';
import articlesData from '../../data/articles.json';

export interface MediumArticle {
  title: string;
  url: string;
  date: string;
  tags: string[];
  summary: string;
  image: string | null;
}

@Component({
  selector: 'app-article-page',
  standalone: true,
  imports: [
    CommonModule,
    SegmentedNavComponent,
    ThemeToggleComponent,
    ReviewItemComponent,
    WriteReviewComponent,
    ReviewSummaryComponent,
  ],
  templateUrl: './article-page.html',
  styleUrl: './article-page.css',
})
export class ArticlePage implements OnInit {
  readonly articles = signal<MediumArticle[]>(articlesData);
  readonly selectedTag = signal('All');
  readonly tags = computed(() => [
    'All',
    ...new Set(this.articles().flatMap(article => article.tags)),
  ]);
  readonly filteredArticles = computed(() => {
    const selectedTag = this.selectedTag();
    return selectedTag === 'All'
      ? this.articles()
      : this.articles().filter(article => article.tags.includes(selectedTag));
  });
  readonly featuredArticle = computed(() => this.filteredArticles()[0] ?? null);
  readonly remainingArticles = computed(() => this.filteredArticles().slice(1));

  reviews: Review[] = [];
  private readonly articleService = inject(ArticleService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    console.log('Page loaded. Starting to fetch reviews...');
    this.getReviews();
  }

  selectTag(tag: string): void {
    this.selectedTag.set(tag);
  }

  getReviews(): void {
    this.articleService.getReviews().subscribe({
      next: data => {
        console.log('Success:', data);
        this.reviews = data;
        this.cdr.detectChanges();
      },
      error: err => {
        console.error('Error:', err);
      },
    });
  }
}
