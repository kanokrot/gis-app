import { Component } from '@angular/core';
import { SegmentedNavComponent } from "../../shared/components/segmented-nav-component/segmented-nav-component";
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import { HomeMarkComponent } from '../../shared/components/home-mark-component/home-mark-component';

@Component({
  selector: 'app-not-found-page',
  imports: [SegmentedNavComponent, ThemeToggleComponent, HomeMarkComponent],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.css',
})
export class NotFoundPage {

}
