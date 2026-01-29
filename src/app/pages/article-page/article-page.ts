import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { ReviewItemComponent } from './components/review-item-component/review-item-component';
import { WriteReviewComponent } from './components/write-review-component/write-review-component';
import { ReviewSummaryComponent } from "./components/review-summary-component/review-summary-component";
import { ArticleService } from './article-service'; 
import { Review } from './components/review-item-component/types';

@Component({
  selector: 'app-article-page',
  standalone: true,
  imports: [
    CommonModule, 
    SegmentedNavComponent, 
    ReviewItemComponent, 
    WriteReviewComponent, 
    ReviewSummaryComponent
  ],
  templateUrl: './article-page.html',
  styleUrl: './article-page.css',
})
export class ArticlePage implements OnInit {

  reviews: Review[] = [];
  private articleService = inject(ArticleService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    console.log('Page loaded. Starting to fetch reviews...');
    this.getReviews();
  }

  getReviews() {
    this.articleService.getReviews().subscribe({
      next: (data) => {
        console.log('Success:', data);
        this.reviews = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error:', err);
      }
    });
  }
}