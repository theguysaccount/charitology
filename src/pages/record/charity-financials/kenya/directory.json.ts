import directory from '../../../../data/kenya-pbo-directory-coverage.json';

export function GET() {
  return new Response(JSON.stringify(directory, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
