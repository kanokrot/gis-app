import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsesPage } from './uses-page';

describe('UsesPage', () => {
  let component: UsesPage;
  let fixture: ComponentFixture<UsesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsesPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UsesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
