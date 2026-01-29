import { Component, Input } from '@angular/core';
import { RatingModule } from 'primeng/rating';
import { FormsModule } from '@angular/forms';
import { Review } from './types';
import { AvatarModule, Avatar } from 'primeng/avatar';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-review-item-component',
  imports: [AvatarModule, RatingModule, FormsModule, CommonModule],
  templateUrl: './review-item-component.html',
  styleUrl: './review-item-component.css',
})
export class ReviewItemComponent {
 @Input({ required: true }) review!: Review;
}
