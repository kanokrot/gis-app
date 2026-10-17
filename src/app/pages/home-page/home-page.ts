import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { SocialInfoComponent } from './components/social-info-component/social-info-component';
import { ArticleBoxComponent } from './components/article-box-component/article-box-component';
import { SubscribeBoxComponent } from './components/subscribe-box-component/subscribe-box-component';
import { WorkProfileComponent } from './components/work-profile-component/work-profile-component';
import { FooterComponent } from './components/footer-component/footer-component';
import { ImageGalleryComponent } from './components/image-gallery-component/image-gallery-component';
import { HeroProfileComponent } from './components/hero-profile-component/hero-profile-component';
import { CommonModule } from '@angular/common';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import articlesData from '../../data/articles.json';

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, SegmentedNavComponent, ThemeToggleComponent, SocialInfoComponent, ArticleBoxComponent, SubscribeBoxComponent, WorkProfileComponent, FooterComponent, ImageGalleryComponent, HeroProfileComponent],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  articleLists = articlesData.slice(0, 3).map(article => ({
    ...article,
    publishedAt: new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' })
      .format(new Date(article.date)),
  }));
}
