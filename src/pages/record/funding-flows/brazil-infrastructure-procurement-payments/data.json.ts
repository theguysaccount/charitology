import { procurementPaymentEdition } from '../../../../lib/brazil-infrastructure-procurement-payments';

export function GET() {
  return new Response(JSON.stringify(procurementPaymentEdition, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
