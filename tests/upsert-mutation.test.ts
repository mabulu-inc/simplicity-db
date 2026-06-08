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

  describe('scalar / external params', () => {
    it('matches a scalar key on a bind param in both halves and inserts it', () => {
      const { update, insert } = upsertMutation(
        'tares',
        [
          ['source_id', 'text', true],
          ['val', 'numeric'],
        ],
        { bulk: true, scalars: { plant_id: { type: 'int', key: true } } },
      );
      // scalar key matched on $2 (recordset is $1), not on n.plant_id
      expect(update).toContain('o.plant_id = $2::int');
      expect(update).toContain('o.source_id = n.source_id');
      // not part of the recordset column list
      expect(update).not.toContain('plant_id int,');
      // insert includes the scalar column + bind value, and matches on it
      expect(insert).toContain('insert into tares (source_id, val, plant_id)');
      expect(insert).toContain('select n.source_id, n.val, $2::int');
      expect(insert).toContain('o.plant_id = $2::int');
    });

    it('writes a non-key scalar in SET and checks it for change', () => {
      const { update, insert } = upsertMutation(
        'events',
        [
          ['id', 'int', true],
          ['name', 'text'],
        ],
        { scalars: { source: {} } },
      );
      expect(update).toContain('source = $2');
      expect(update).toContain('o.source is distinct from $2');
      expect(insert).toContain('insert into events (id, name, source)');
      expect(insert).toContain('select n.id, n.name, $2');
    });

    it('numbers multiple scalars in declared order starting at $2', () => {
      const { update } = upsertMutation(
        't',
        [['source_id', 'text', true], ['v', 'numeric']],
        { scalars: { plant_id: { key: true }, batch_id: { key: true } } },
      );
      expect(update).toContain('o.plant_id = $2');
      expect(update).toContain('o.batch_id = $3');
    });
  });
});
