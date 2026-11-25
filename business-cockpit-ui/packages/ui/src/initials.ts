/** The initials of the badge: from the long form of the name, or else from the user id. */
export function initialsOf(longForm: string | undefined, userId: string): string {
  const parts = (longForm?.trim() || userId).split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => part[0].toUpperCase()).join('');
}
