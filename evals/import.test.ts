import { describe, expect, it } from 'vitest';
import { parseProposal } from '../engine/index';
import { splitAnswers } from './proposals-io';

describe('eval:import answer parsing', () => {
  it('splits KEY lines and their JSON, tolerating markdown wrappers and fences', () => {
    const text = [
      'Here you go:',
      'KEY H1/apple_bill_999',
      '{"service":"Unknown Apple app","category":"apps","isSubscription":true,"proposedAction":"ASK","confidence":0.5,"rationale":"Unidentified."}',
      '',
      '**KEY H1/readly**',
      '```json',
      '{"service":"Readly","category":"magazines","isSubscription":true,"proposedAction":"CANCEL","confidence":0.9,"rationale":"Unused."}',
      '```',
      '### H4/spotify@not_shared',
      '{"service":"Spotify","category":"music","isSubscription":true,"proposedAction":"FLAG","confidence":0.8,"rationale":"Downgrade."}',
    ].join('\n');
    const a = splitAnswers(text);
    expect(a.map((x) => x.key)).toEqual(['H1/apple_bill_999', 'H1/readly', 'H4/spotify@not_shared']);
    expect(a.map((x) => parseProposal(x.body).proposedAction)).toEqual(['ASK', 'CANCEL', 'FLAG']);
  });
  it('rejects malformed answers', () => {
    const bad = splitAnswers('KEY H1/readly\n{"service":"Readly","proposedAction":"DELETE"}\nKEY H1/sky\nnot json');
    for (const x of bad) expect(() => parseProposal(x.body)).toThrow();
  });
  it('does not treat a JSON line as a key', () => {
    expect(splitAnswers('{"rationale":"H1/readly"}')).toEqual([]);
  });
});
