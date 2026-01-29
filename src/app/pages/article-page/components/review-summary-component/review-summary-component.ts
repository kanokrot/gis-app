import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Review } from '../review-item-component/types'; 
import { FormsModule } from '@angular/forms'; 
import { RatingModule } from 'primeng/rating';

@Component({
  selector: 'app-review-summary-component',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    RatingModule
  ],
  templateUrl: './review-summary-component.html',
  styleUrl: './review-summary-component.css'
})
export class ReviewSummaryComponent implements OnChanges {

  @Input() reviews: Review[] = [];

  averageRating: number = 0;
  totalReviews: number = 0;
  
  starCounts = [0, 0, 0, 0, 0, 0];
  starPercentages = [0, 0, 0, 0, 0, 0];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reviews']) {
      this.calculateStats();
    }
  }

  calculateStats() {
    this.totalReviews = this.reviews.length;
    
    this.starCounts = [0, 0, 0, 0, 0, 0];
    this.starPercentages = [0, 0, 0, 0, 0, 0];
    let sumRating = 0;

    if (this.totalReviews === 0) {
        this.averageRating = 0;
        return;
    }

    this.reviews.forEach(review => {
      const rating = Math.round(review.rating); 
      if (rating >= 1 && rating <= 5) {
        this.starCounts[rating]++;
      }
      sumRating += review.rating;
    });

    for (let i = 1; i <= 5; i++) {
      this.starPercentages[i] = Math.round((this.starCounts[i] / this.totalReviews) * 100);
    }
    
    this.averageRating = parseFloat((sumRating / this.totalReviews).toFixed(1));
  }
}