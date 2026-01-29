import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Review } from './components/review-item-component/types';

@Injectable({
  providedIn: 'root',
})
export class ArticleService {
  private readonly API_URL = 'https://tkhwqftliycsougqycab.supabase.co/rest/v1/Reviews';
  private readonly API_KEY = 'sb_publishable_h7385d9MLfkxuSsvctHnZw_2wgLblHW';

  private readonly headers = new HttpHeaders({
    apikey: this.API_KEY,
    Authorization: `Bearer ${this.API_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  });

  private readonly http = inject(HttpClient);
    
  insertReview(review: Review): Observable<any> {
    return this.http.post(this.API_URL, review, {
      headers: this.headers,
    });
  }
    getReviews(): Observable<Review[]> {
    return this.http.get<Review[]>(this.API_URL, {
      headers: this.headers,
      params: {
        select: '*',
        order: 'created_at.desc',
      },
    });
  }
}
