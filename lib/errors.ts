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
  const code = value && typeof value === "object" && "code" in value ? String(value.code) : "";
  if (/otp_expired|session_not_found|session_expired|bad_jwt/.test(code) || /expired|invalid.*token|auth session missing/i.test(message)) return "El enlace de recuperación venció o ya fue usado. Solicita un nuevo correo.";
  if (/over_email_send_rate_limit|over_request_rate_limit/.test(code) || /rate limit|too many requests|after \d+ seconds/i.test(message)) return "Se han solicitado varios correos. Espera unos minutos antes de intentarlo de nuevo.";
  if (code === "same_password" || /new password.*different/i.test(message)) return "Elige una contraseña diferente de la anterior.";
  if (code === "weak_password" || /password.*(weak|short|least)/i.test(message)) return "Usa una contraseña de al menos 8 caracteres. Combina letras, números y símbolos.";
  if (/email_address_not_authorized|email_provider_disabled/.test(code) || /error sending.*email|email.*not authorized/i.test(message)) return "No pudimos enviar el correo de recuperación. El servicio de correo necesita una revisión.";
  return message;
}
