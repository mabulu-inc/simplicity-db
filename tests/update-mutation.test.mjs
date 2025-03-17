import { describe, it } from 'node:test';
import assert from 'node:assert';
import updateMutation from '../src/update-mutation.mjs';

describe('updateMutation', () => {
  it('generates an update mutation with 2 key columns and default updated', () => {
    const table = 'test_table';
    const fieldset = [
      ['id', 'int', true],
      ['sub_id', 'int', true],
      ['name', 'varchar'],
    ];
    const query = updateMutation(table, fieldset);
    assert.equal(
      query,
      `
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
returning *`,
      'Should generate an update mutation query'
    );
  });

  it('generates an update mutation with 1 key column and supplied updated', () => {
    const table = 'test_table';
    const fieldset = [
      ['id', 'int', true],
      ['name', 'varchar'],
    ];
    const query = updateMutation(table, fieldset, 'updated');
    assert.equal(
      query,
      `
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
returning *`,
      'Should generate an update mutation query'
    );
  });
});
