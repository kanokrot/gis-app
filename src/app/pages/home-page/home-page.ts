import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { FooterComponent } from './components/footer-component/footer-component';
import { HeroProfileComponent } from './components/hero-profile-component/hero-profile-component';
import { CommonModule } from '@angular/common';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import { HomeMarkComponent } from '../../shared/components/home-mark-component/home-mark-component';
import articlesData from '../../data/articles.json';

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, RouterLink, HomeMarkComponent, SegmentedNavComponent, ThemeToggleComponent, FooterComponent, HeroProfileComponent],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  articleLists = [...articlesData]
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date))
    .slice(0, 3);
}
