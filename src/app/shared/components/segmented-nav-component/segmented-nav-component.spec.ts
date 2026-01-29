import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SegmentedNavComponent } from './segmented-nav-component';

describe('SegmentedNavComponent', () => {
  let component: SegmentedNavComponent;
  let fixture: ComponentFixture<SegmentedNavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SegmentedNavComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SegmentedNavComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
