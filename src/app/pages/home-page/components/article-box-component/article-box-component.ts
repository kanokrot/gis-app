import { Component, Input } from '@angular/core';
import { ArticleItem } from './types';

@Component({
  selector: 'app-article-box-component',
  imports: [],
  templateUrl: './article-box-component.html',
  styleUrl: './article-box-component.css',
})
export class ArticleBoxComponent {
  @Input() article: ArticleItem | undefined;
}
