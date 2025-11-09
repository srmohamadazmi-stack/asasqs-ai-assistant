export type Message = {
  role: 'user' | 'model' | 'error';
  content: string;
  sources?: {
    uri: string;
    title: string;
  }[];
};
