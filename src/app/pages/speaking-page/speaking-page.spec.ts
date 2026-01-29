import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpeakingPage } from './speaking-page';

describe('SpeakingPage', () => {
  let component: SpeakingPage;
  let fixture: ComponentFixture<SpeakingPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeakingPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpeakingPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
