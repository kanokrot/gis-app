export interface Review {
    id?: number; 
    created_at?: string;
    username: string;
    rating: number;       // 1–5
    comment: string;
}