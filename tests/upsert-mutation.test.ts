import { describe, expect, it } from 'vitest';
import { upsertMutation, type FieldSpec } from '../src/index.js';

// SQL keyword casing is cosmetic. These tests assert on the *structure* of
// the generated SQL (columns, key matches, valueExpr substitution, option
// toggles), so they match against a lowercased copy and never break when the
// generator's keyword casing changes. Behavioral correctness is proven
// separately in upsert-mutation.integration.test.ts against real Postgres.
const ci = (sql: string) => sql.toLowerCase();

describe('upsertMutation', () => {
  const fieldset: FieldSpec[] = [
    ['id', 'int', true],
    ['name', 'text'],
  ];

  it('returns paired update and insert statements', () => {
    const { update, insert } = upsertMutation('users', fieldset);
    expect(ci(update)).toContain('update users o');
    expect(ci(insert)).toContain('insert into users (id, name)');
    expect(ci(insert)).toContain('where not exists');
    expect(ci(insert)).toContain('select 1 from users o');
  });

  it('uses jsonb_to_recordset for both halves in bulk mode', () => {
    const { update, insert } = upsertMutation('users', fieldset, { bulk: true });
    expect(ci(update)).toContain('jsonb_to_recordset($1)');
    expect(ci(insert)).toContain('jsonb_to_recordset($1)');
  });

  it('uses jsonb_to_record for both halves in single-record mode', () => {
    const { update, insert } = upsertMutation('users', fieldset);
    expect(ci(update)).toContain('jsonb_to_record($1)');
    expect(ci(insert)).toContain('jsonb_to_record($1)');
  });

  it('respects a per-field valueExpr in the insert select list', () => {
    const { insert } = upsertMutation('users', [
      ['id', 'int', true],
      ['email', 'text', false, 'lower(n.email)'],
    ]);
    expect(ci(insert)).toContain('select n.id, lower(n.email)');
  });

  it('matches the existing row on the key fields in WHERE NOT EXISTS', () => {
    const { insert } = upsertMutation('measurements', [
      ['plant_id', 'int', true],
      ['source_id', 'text', true],
      ['value', 'numeric'],
    ]);
    expect(ci(insert)).toContain('o.plant_id = n.plant_id');
    expect(ci(insert)).toContain('o.source_id = n.source_id');
  });

  describe('onConflict', () => {
    it('omits ON CONFLICT by default', () => {
      const { insert } = upsertMutation('users', fieldset);
      expect(ci(insert)).not.toContain('on conflict');
    });

    it('appends ON CONFLICT DO NOTHING after WHERE NOT EXISTS when requested', () => {
      const { insert } = upsertMutation('users', fieldset, {
        onConflict: 'DO NOTHING',
      });
      const sql = ci(insert);
      expect(sql).toContain('where not exists');
      expect(sql).toContain('on conflict do nothing');
      // race backstop sits after the anti-churn guard, before RETURNING
      expect(sql.indexOf('where not exists')).toBeLessThan(
        sql.indexOf('on conflict do nothing'),
      );
      expect(sql.indexOf('on conflict do nothing')).toBeLessThan(
        sql.indexOf('returning *'),
      );
    });

    it('never adds ON CONFLICT to the update half', () => {
      const { update } = upsertMutation('users', fieldset, {
        onConflict: 'DO NOTHING',
      });
      expect(ci(update)).not.toContain('on conflict');
    });
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
      expect(ci(update)).toContain('o.plant_id = $2::int');
      expect(ci(update)).toContain('o.source_id = n.source_id');
      // not part of the recordset column list
      expect(ci(update)).not.toContain('plant_id int,');
      // insert includes the scalar column + bind value, and matches on it
      expect(ci(insert)).toContain('insert into tares (source_id, val, plant_id)');
      expect(ci(insert)).toContain('select n.source_id, n.val, $2::int');
      expect(ci(insert)).toContain('o.plant_id = $2::int');
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
      expect(ci(update)).toContain('source = $2');
      expect(ci(update)).toContain('o.source is distinct from $2');
      expect(ci(insert)).toContain('insert into events (id, name, source)');
      expect(ci(insert)).toContain('select n.id, n.name, $2');
    });

    it('numbers multiple scalars in declared order starting at $2', () => {
      const { update } = upsertMutation(
        't',
        [['source_id', 'text', true], ['v', 'numeric']],
        { scalars: { plant_id: { key: true }, batch_id: { key: true } } },
      );
      expect(ci(update)).toContain('o.plant_id = $2');
      expect(ci(update)).toContain('o.batch_id = $3');
    });
  });

  describe('derived and input-only columns', () => {
    const fieldset: FieldSpec[] = [
      ['source_id', 'text', true],
      ['unit', 'text', false, undefined, 'input'],
      ['unit_id', 'int', false, '(select unit_id from units where code = n.unit)', 'derived'],
    ];

    it('omits a derived column from the recordset but writes it via valueExpr', () => {
      const { update, insert } = upsertMutation('m', fieldset, { bulk: true });
      // derived column not declared in the jsonb_to_recordset column list
      expect(ci(update)).not.toContain('unit_id int');
      // set and insert use the valueExpr
      expect(ci(update)).toContain('unit_id = (select unit_id from units where code = n.unit)');
      expect(ci(insert)).toContain('insert into m (source_id, unit_id)');
      expect(ci(insert)).toContain('(select unit_id from units where code = n.unit)');
    });

    it('checks a derived column against its valueExpr, not n.col', () => {
      const { update } = upsertMutation('m', fieldset, { bulk: true });
      expect(ci(update)).toContain(
        'o.unit_id is distinct from (select unit_id from units where code = n.unit)',
      );
      expect(ci(update)).not.toContain('o.unit_id is distinct from n.unit_id');
    });

    it('keeps an input-only column in the recordset but never writes it', () => {
      const { update, insert } = upsertMutation('m', fieldset, { bulk: true });
      // present in the recordset so n.unit resolves for the derived valueExpr
      expect(ci(update)).toContain('unit text');
      // but never set, change-checked, or inserted
      expect(ci(update)).not.toContain('unit = ');
      expect(ci(update)).not.toContain('o.unit is distinct from');
      expect(ci(insert)).not.toContain(' unit,');
      expect(ci(insert)).not.toContain(', unit)');
    });

    it('uses the valueExpr in the change check for a plain value field too', () => {
      const { update } = upsertMutation('users', [
        ['id', 'int', true],
        ['email', 'text', false, 'lower(n.email)'],
      ]);
      expect(ci(update)).toContain('o.email is distinct from lower(n.email)');
    });
  });
});
