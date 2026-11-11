import { invoiceEdition } from '../../../../lib/brazil-infrastructure-invoice-items';

export function GET() {
  return new Response(JSON.stringify(invoiceEdition, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
