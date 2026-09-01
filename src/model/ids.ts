let counter = 0;
/** Short unique id. Stable enough within a session; persisted ids stay unique via random suffix. */
export const uid = (prefix = 'id'): string =>
  `${prefix}_${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
