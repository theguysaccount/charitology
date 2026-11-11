import { procurementLotsEdition } from '../../../../lib/brazil-infrastructure-procurement-lots';

export function GET() {
  return new Response(JSON.stringify(procurementLotsEdition, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
