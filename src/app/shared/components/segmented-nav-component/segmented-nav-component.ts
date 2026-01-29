import { Component } from '@angular/core';
import { SegmentedNavItem } from './types';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-segmented-nav-component',
  imports: [CommonModule, RouterModule],
  templateUrl: './segmented-nav-component.html',
  styleUrl: './segmented-nav-component.css',
})
export class SegmentedNavComponent {
    navItems: SegmentedNavItem[] = [
    { label: 'About', href: '/about' },
    { label: 'Articles', href: '/article' },
    { label: 'Projects', href: '/project' },
    { label: 'Speaking', href: '/speaking' },
    { label: 'Uses', href: '/uses' },
  ];

}
