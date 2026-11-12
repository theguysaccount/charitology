import { joacabaOutpatient } from '../../../../../lib/brazil-joacaba-outpatient';

export function GET() {
  return new Response(JSON.stringify(joacabaOutpatient, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
