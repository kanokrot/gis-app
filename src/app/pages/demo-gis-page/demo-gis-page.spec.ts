import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemoGisPage } from './demo-gis-page';

describe('DemoGisPage', () => {
  let component: DemoGisPage;
  let fixture: ComponentFixture<DemoGisPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoGisPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoGisPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
