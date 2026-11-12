import caseStudy from '../../../../data/funding-flows/brazil-joacaba-rehabilitation.json';

export function GET() {
  return new Response(JSON.stringify(caseStudy, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
