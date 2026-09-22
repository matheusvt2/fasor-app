import postgres from 'postgres';

export function createDb(url: string) {
  return postgres(url, { max: 5 });
}
