import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewItemComponent } from './review-item-component';

describe('ReviewItemComponent', () => {
  let component: ReviewItemComponent;
  let fixture: ComponentFixture<ReviewItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewItemComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewItemComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('review', {
      username: 'Test reviewer',
      rating: 5,
      comment: 'Helpful feedback',
    });
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('T');
    expect(fixture.nativeElement.querySelector('[role="img"]').getAttribute('aria-label')).toBe('5 out of 5 stars');
  });
});
