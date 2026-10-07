export function asError(value: unknown, fallback = "No pudimos completar la operación."): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === "object" && "message" in value) {
    const error = new Error(String(value.message || fallback));
    if ("code" in value) Object.assign(error, { code: value.code });
    return error;
  }
  return new Error(typeof value === "string" && value ? value : fallback);
}
