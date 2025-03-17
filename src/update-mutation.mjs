export default (table, fieldset, updated) => `
update ${table} o
set${fieldset
  .filter(([, , isKey]) => !isKey)
  .map(
    ([field, , , value]) => `
  ${field} = ${value || `n.${field}`}`
  )
  .join(',')},
  ${updated || 'updated_at'} = current_timestamp
from jsonb_to_record($1) as n(${fieldset
  .map(
    ([field, type]) => `
  ${field} ${type}`
  )
  .join(',')}
) where
  ${fieldset
    .filter(([, , isKey]) => isKey)
    .map(([field]) => `o.${field} = n.${field}`).join(`
  and `)}
  and (
    ${fieldset
      .filter(([, , isKey]) => !isKey)
      .map(([field]) => `o.${field} is distinct from n.${field}`).join(`
    or `)}
  )
returning *`;
