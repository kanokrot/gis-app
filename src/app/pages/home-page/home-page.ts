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

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, SegmentedNavComponent, SocialInfoComponent, ArticleBoxComponent, SubscribeBoxComponent, WorkProfileComponent, FooterComponent, ImageGalleryComponent, HeroProfileComponent],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  articleLists = [
    {
      title: 'Crafting a design system for a multiplanetary future',
      description: 'Most companies try to stay ahead of the curve when it comes to visual design, but for Planetaria we needed to create a brand that would still inspire us 100 years from now when humanity has spread across our entire solar system.',
      href: '/articles/design-system',
      publishedAt: 'September 5, 2022',
    },
    {
      title: 'Introducing Animaginary: High performance web animations',
      description: 'When you’re building a website for a company as ambitious as Planetaria, you need to make an impression. I wanted people to visit our website and see animations that looked more realistic than reality itself.',
      href: '/articles/design-system',
      publishedAt: 'September 2, 2022',
    },
    {
      title: 'Rewriting the cosmOS kernel in Rust',
      description: 'When we released the first version of cosmOS last year, it was written in Go. Go is a wonderful programming language, but it’s been a while since I’ve seen an article on the front page of Hacker News about rewriting some important tool in Go and I see articles on there about rewriting things in Rust every single week.',
      href: '/articles/design-system',
      publishedAt: 'July 14, 2022',
    },
  ]
}
