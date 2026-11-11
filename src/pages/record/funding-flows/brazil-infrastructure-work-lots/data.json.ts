import { workLotEdition } from '../../../../lib/brazil-infrastructure-work-lots';

export function GET() {
  return new Response(JSON.stringify(workLotEdition, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
