import { describe, expect, it } from 'vitest';
import { updateMutation, type FieldSpec } from '../src/index.js';

describe('updateMutation', () => {
  it('generates an update mutation with 2 key columns and default updated_at', () => {
    const fieldset: FieldSpec[] = [
      ['id', 'int', true],
      ['sub_id', 'int', true],
      ['name', 'varchar'],
    ];
    const query = updateMutation('test_table', fieldset);
    expect(query).toBe(`
update test_table o
set
  name = n.name,
  updated_at = current_timestamp
from jsonb_to_record($1) as n(
  id int,
  sub_id int,
  name varchar
) where
  o.id = n.id
  and o.sub_id = n.sub_id
  and (
    o.name is distinct from n.name
  )
returning *`);
  });

  it('generates an update mutation with 1 key column and custom updated column name', () => {
    const fieldset: FieldSpec[] = [
      ['id', 'int', true],
      ['name', 'varchar'],
    ];
    const query = updateMutation('test_table', fieldset, 'updated');
    expect(query).toBe(`
update test_table o
set
  name = n.name,
  updated = current_timestamp
from jsonb_to_record($1) as n(
  id int,
  name varchar
) where
  o.id = n.id
  and (
    o.name is distinct from n.name
  )
returning *`);
  });

  it('uses a custom value expression when provided in the FieldSpec', () => {
    const fieldset: FieldSpec[] = [
      ['id', 'int', true],
      ['email', 'text', false, 'lower(n.email)'],
    ];
    const query = updateMutation('users', fieldset);
    expect(query).toContain('email = lower(n.email)');
    // The cast still uses the column name even when valueExpr is set:
    expect(query).toContain('email text');
  });
});
