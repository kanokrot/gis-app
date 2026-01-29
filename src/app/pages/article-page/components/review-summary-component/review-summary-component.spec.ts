import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewSummaryComponent } from './review-summary-component';

describe('ReviewSummaryComponent', () => {
  let component: ReviewSummaryComponent;
  let fixture: ComponentFixture<ReviewSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewSummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewSummaryComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
