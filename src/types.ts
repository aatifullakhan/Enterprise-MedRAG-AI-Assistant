export interface Document {
  id: number;
  title: string;
  content: string;
  source: string;
  created_at: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  isError?: boolean;
}
