import type { SupabaseClient } from "@supabase/supabase-js";
import { asError } from "@/lib/errors";

type Auth = SupabaseClient["auth"];
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const RECOVERY_KEY = "autoram.password.recovery.v1";
const RECOVERY_WINDOW = 30 * 60 * 1000;
export const RECOVERY_EXPIRED = "El enlace de recuperación venció o ya fue usado. Solicita un nuevo correo.";
export const RECOVERY_SENT = "Si ese correo tiene una cuenta, recibirás un enlace para recuperar tu contraseña. Revisa también la carpeta de spam.";

export function passwordRecoveryRedirect(origin: string) {
  const url = new URL("/", origin);
  url.searchParams.set("auth", "recovery");
  return url.toString();
}

export function isPasswordRecoveryURL(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return url.searchParams.get("auth") === "recovery" || hash.get("type") === "recovery";
}

export function clearPasswordRecovery(storage: RecoveryStorage) {
  try { storage.removeItem(RECOVERY_KEY); } catch { /* La sesión de Supabase sigue protegida aunque no haya almacenamiento. */ }
}

function hasRecoveryContext(storage: RecoveryStorage, userId: string) {
  try {
    const record = JSON.parse(storage.getItem(RECOVERY_KEY) || "null") as { userId?: string; until?: number } | null;
    const until = record?.until || 0;
    return record?.userId === userId && until > Date.now() && until <= Date.now() + RECOVERY_WINDOW;
  } catch { return false; }
}

// Este marcador solo conserva la pantalla al recargar. Supabase valida la sesión y autoriza el cambio.
export async function resolvePasswordRecovery(auth: Auth, href: string, storage: RecoveryStorage) {
  const hash = new URLSearchParams(new URL(href).hash.slice(1));
  if (hash.has("error") || hash.has("error_code")) {
    clearPasswordRecovery(storage);
    throw new Error(RECOVERY_EXPIRED);
  }
  const { data, error } = await auth.getSession();
  if (error) throw asError(error);
  const session = data.session;
  const freshLink = hash.get("type") === "recovery" && Boolean(hash.get("access_token")) && hash.get("access_token") === session?.access_token;
  if (!session || (!freshLink && !hasRecoveryContext(storage, session.user.id))) throw new Error(RECOVERY_EXPIRED);
  const verified = await auth.getUser();
  if (verified.error) throw asError(verified.error);
  if (!verified.data.user || verified.data.user.id !== session.user.id) throw new Error(RECOVERY_EXPIRED);
  if (freshLink) {
    try { storage.setItem(RECOVERY_KEY, JSON.stringify({ userId: session.user.id, until: Date.now() + RECOVERY_WINDOW })); } catch { /* El enlace actual se puede usar sin guardar el contexto. */ }
  }
  return verified.data.user.id;
}

export async function requestPasswordRecovery(auth: Auth, email: string, origin: string) {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Escribe un correo electrónico válido.");
  const { error } = await auth.resetPasswordForEmail(address, { redirectTo: passwordRecoveryRedirect(origin) });
  if (error) throw asError(error);
  return RECOVERY_SENT;
}

export async function updateRecoveredPassword(auth: Auth, userId: string, password: string, confirmation: string, createRecoveryAuth: () => Auth) {
  if (password.length < 8 || !password.trim()) throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden. Vuelve a escribirlas.");
  const current = await auth.getSession();
  if (current.error) throw asError(current.error);
  const session = current.data.session;
  if (!userId || session?.user.id !== userId || !session.access_token || !session.refresh_token) throw new Error(RECOVERY_EXPIRED);
  const tokens = { access_token: session.access_token, refresh_token: session.refresh_token };
  const verified = await auth.getUser(tokens.access_token);
  if (verified.error) throw asError(verified.error);
  if (verified.data.user?.id !== userId) throw new Error(RECOVERY_EXPIRED);
  // La sesión puede cambiar en otra pestaña mientras llega la verificación.
  // Fijar la operación a esta copia evita cambiar la contraseña de otra cuenta.
  const recoveryAuth = createRecoveryAuth();
  const bound = await recoveryAuth.setSession(tokens);
  if (bound.error) throw asError(bound.error);
  if (bound.data.user?.id !== userId) throw new Error(RECOVERY_EXPIRED);
  const { error } = await recoveryAuth.updateUser({ password });
  if (error) throw asError(error);
}
