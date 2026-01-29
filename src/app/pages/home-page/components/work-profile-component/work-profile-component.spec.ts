import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkProfileComponent } from './work-profile-component';

describe('WorkProfileComponent', () => {
  let component: WorkProfileComponent;
  let fixture: ComponentFixture<WorkProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkProfileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
