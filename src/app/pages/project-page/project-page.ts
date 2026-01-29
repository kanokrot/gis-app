import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-project-page',
  imports: [SegmentedNavComponent, RouterModule],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
})
export class ProjectPage {

}
