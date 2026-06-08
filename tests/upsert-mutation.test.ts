import { describe, expect, it } from 'vitest';
import { upsertMutation, type FieldSpec } from '../src/index.js';

describe('upsertMutation', () => {
  const fieldset: FieldSpec[] = [
    ['id', 'int', true],
    ['name', 'text'],
  ];

  it('returns paired update and insert statements', () => {
    const { update, insert } = upsertMutation('users', fieldset);
    expect(update).toContain('update users o');
    expect(insert).toContain('insert into users (id, name)');
    expect(insert).toContain('where not exists');
    expect(insert).toContain('select 1 from users o');
  });

  it('uses jsonb_to_recordset for both halves in bulk mode', () => {
    const { update, insert } = upsertMutation('users', fieldset, { bulk: true });
    expect(update).toContain('jsonb_to_recordset($1)');
    expect(insert).toContain('jsonb_to_recordset($1)');
  });

  it('uses jsonb_to_record for both halves in single-record mode', () => {
    const { update, insert } = upsertMutation('users', fieldset);
    expect(update).toContain('jsonb_to_record($1)');
    expect(insert).toContain('jsonb_to_record($1)');
  });

  it('respects a per-field valueExpr in the insert select list', () => {
    const { insert } = upsertMutation('users', [
      ['id', 'int', true],
      ['email', 'text', false, 'lower(n.email)'],
    ]);
    expect(insert).toContain('select n.id, lower(n.email)');
  });

  it('matches the existing row on the key fields in WHERE NOT EXISTS', () => {
    const { insert } = upsertMutation('measurements', [
      ['plant_id', 'int', true],
      ['source_id', 'text', true],
      ['value', 'numeric'],
    ]);
    expect(insert).toContain('o.plant_id = n.plant_id');
    expect(insert).toContain('o.source_id = n.source_id');
  });
});
