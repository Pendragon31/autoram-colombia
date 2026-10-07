export function asError(value: unknown, fallback = "No pudimos completar la operación."): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === "object" && "message" in value) {
    const error = new Error(String(value.message || fallback));
    if ("code" in value) Object.assign(error, { code: value.code });
    return error;
  }
  return new Error(typeof value === "string" && value ? value : fallback);
}

export function authErrorMessage(value: unknown): string {
  const message = asError(value, "No pudimos completar el ingreso.").message;
  if (/failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message)) {
    return "No pudimos conectar con el servicio de acceso. Revisa tu conexión e inténtalo de nuevo.";
  }
  if (/invalid login credentials/i.test(message)) return "El correo o la contraseña no son correctos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu correo antes de ingresar. Revisa también la carpeta de spam.";
  return message;
}
