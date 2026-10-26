import { config } from '../lib/config.mjs';
import { provider } from '../lib/provider.mjs';
// Run deliberately by the owner. Creates preference resources, never sends or changes contacts.
if (process.argv[2] !== '--create-preferences') throw new Error('Pass --create-preferences to create dedicated newsletter resources (no sends).');
const mail = provider(config());
try {
  const topics = await mail.call('GET', '/topics');
  const segments = await mail.call('GET', '/segments');
  const topicMatches = topics.data?.filter(x => x.name === 'The Charitology Letter') || [];
  const segmentMatches = segments.data?.filter(x => x.name === 'Charitology confirmed newsletter') || [];
  if (topics.has_more || segments.has_more || topicMatches.length > 1 || segmentMatches.length > 1) throw new Error('Review existing paginated or duplicate resources manually');
  let topic = topicMatches[0]; let segment = segmentMatches[0];
  if (!topic) topic = await mail.call('POST', '/topics', { name: 'The Charitology Letter', description: 'Charitology research, tools, evidence and corrections. Explicit confirmed signup required.', default_subscription: 'opt_out' });
  topic = await mail.call('GET', `/topics/${encodeURIComponent(topic.id)}`);
  if (topic.default_subscription !== 'opt_out') throw new Error('Existing topic does not require explicit subscription; do not reuse it');
  if (!segment) segment = await mail.call('POST', '/segments', { name: 'Charitology confirmed newsletter' });
  console.log(`RESEND_TOPIC_ID=${topic.id}\nRESEND_SEGMENT_ID=${segment.id}\nNo email sent; no contact preferences changed.`);
} catch { console.error('Preference setup stopped. Inspect provider resources before retrying an ambiguous create. No email sent.'); process.exitCode = 1; }
