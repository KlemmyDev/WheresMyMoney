/** A merchant key from a typed name, the way the server makes one ("Domino's Pizza" → "DOMINOS PIZZA"). */
export const keyOf = (name: string) =>
  name
    .toUpperCase()
    .replace(/'/g, "")
    .replace(/[^A-Z0-9&' -]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .slice(0, 60);

/** Whether a typed name is the same as a merchant or business already there (by its name or its key). */
export const sameName = (typed: string, other: { name: string; key: string }) => {
  const t = typed.trim().toLowerCase();
  return !!t && (other.name.toLowerCase() === t || other.key === keyOf(typed));
};
