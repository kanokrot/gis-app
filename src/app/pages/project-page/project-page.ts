import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { RouterModule } from '@angular/router';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';

@Component({
  selector: 'app-project-page',
  imports: [SegmentedNavComponent, RouterModule, ThemeToggleComponent],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
})
export class ProjectPage {

}
