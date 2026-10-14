/** Names joined as a sentence would: "A", "A and B", "A, B and C". */
export function listText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
