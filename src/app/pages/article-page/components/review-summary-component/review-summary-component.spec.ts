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

  it('shows the average rating and the count, including zero reviews', () => {
    fixture.componentRef.setInput('reviews', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('—');
    expect(fixture.nativeElement.textContent).toContain('Based on 0 reviews');

    fixture.componentRef.setInput('reviews', [
      { username: 'A', rating: 4, comment: 'Good' },
      { username: 'B', rating: 5, comment: 'Great' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('4.5');
    expect(fixture.nativeElement.textContent).toContain('Based on 2 reviews');
  });
});
