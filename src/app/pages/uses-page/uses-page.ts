import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';

@Component({
  selector: 'app-uses-page',
  imports: [SegmentedNavComponent, ThemeToggleComponent],
  templateUrl: './uses-page.html',
  styleUrl: './uses-page.css',
})
export class UsesPage {
}
