import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-subscribe-box-component',
  imports: [],
  templateUrl: './subscribe-box-component.html',
  styleUrl: './subscribe-box-component.css',
})
export class SubscribeBoxComponent {
  email = signal('');

  updateEmailValue(value: string) {
    this.email.set(value);
  }

  onSubmit() {
    var currentEmailValue = this.email();
    console.log('Email:', currentEmailValue);
  }
}
