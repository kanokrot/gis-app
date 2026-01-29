import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubscribeBoxComponent } from './subscribe-box-component';

describe('SubscribeBoxComponent', () => {
  let component: SubscribeBoxComponent;
  let fixture: ComponentFixture<SubscribeBoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscribeBoxComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubscribeBoxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
