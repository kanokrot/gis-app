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
  });
});
