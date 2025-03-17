export const ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  UNDEFINED_COLUMN: '42703',
};

export const MESSAGES = {
  UNIQUE_VIOLATION: (tableInfo, columnInfo) =>
    `A record with these details already exists${tableInfo}${columnInfo}. Please use different values..`,
  FOREIGN_KEY_VIOLATION_MISSING_PARENT: (tableInfo) =>
    `You're trying to reference a record that doesn't exist${tableInfo}.`,
  FOREIGN_KEY_VIOLATION_REFERENCED: (tableInfo) =>
    `This record cannot be changed or removed${tableInfo} because it’s still referenced by other records.`,
  FOREIGN_KEY_VIOLATION_GENERIC: (tableInfo) =>
    `This operation violates a foreign key constraint${tableInfo}. Please ensure all references are valid.`,
  NOT_NULL_VIOLATION: (tableInfo, columnInfo) =>
    `A required field is missing${tableInfo}${columnInfo}. Please fill in all required information.`,
  STRING_DATA_RIGHT_TRUNCATION: (tableInfo, columnInfo) =>
    `The text you entered is too long${tableInfo}${columnInfo}. Please shorten it and try again.`,
  UNDEFINED_COLUMN: (tableInfo, columnInfo) =>
    `An unexpected database error occurred${tableInfo}${columnInfo}. Please try again later.`,
  DEFAULT:
    'An error occurred while processing your request. Please try again later.',
};

export function formatTableColumnInfo(table, column) {
  const tableInfo = table ? ` in table "${table}"` : '';
  const columnInfo = column ? ` (column "${column}")` : '';
  return { tableInfo, columnInfo };
}

export function friendlyError(error) {
  if (!error || !error.code) {
    return MESSAGES.DEFAULT;
  }

  const { code, table, column, detail } = error;
  const { tableInfo, columnInfo } = formatTableColumnInfo(table, column);

  if (code === ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    if (detail?.includes('is not present in table')) {
      return MESSAGES.FOREIGN_KEY_VIOLATION_MISSING_PARENT(tableInfo);
    } else if (detail?.includes('is still referenced from table')) {
      return MESSAGES.FOREIGN_KEY_VIOLATION_REFERENCED(tableInfo);
    }
    return MESSAGES.FOREIGN_KEY_VIOLATION_GENERIC(tableInfo);
  }

  const errorMessages = {
    [ERROR_CODES.UNIQUE_VIOLATION]: MESSAGES.UNIQUE_VIOLATION(
      tableInfo,
      columnInfo
    ),
    [ERROR_CODES.NOT_NULL_VIOLATION]: MESSAGES.NOT_NULL_VIOLATION(
      tableInfo,
      columnInfo
    ),
    [ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION]:
      MESSAGES.STRING_DATA_RIGHT_TRUNCATION(tableInfo, columnInfo),
    [ERROR_CODES.UNDEFINED_COLUMN]: MESSAGES.UNDEFINED_COLUMN(
      tableInfo,
      columnInfo
    ),
  };

  return errorMessages[code] || MESSAGES.DEFAULT;
}
