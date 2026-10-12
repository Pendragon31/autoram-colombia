"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { authErrorMessage } from "@/lib/errors";
import { clearPasswordRecovery, resolvePasswordRecovery, updateRecoveredPassword } from "@/lib/password-recovery";

const tabStorage = {
  getItem(key: string) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  setItem(key: string, value: string) { try { window.sessionStorage.setItem(key, value); } catch { /* El enlace actual sigue disponible. */ } },
  removeItem(key: string) { try { window.sessionStorage.removeItem(key); } catch { /* No hay contexto guardado. */ } },
};

export default function PasswordRecovery({ brand }: { brand: ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const href = window.location.href;
    // Leer el enlace antes de que Supabase retire los tokens de la dirección.
    void Promise.resolve().then(async () => {
      if (!active) return;
      const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("No pudimos comprobar el enlace. Revisa tu conexión y vuelve a abrir el correo.")), 20_000); });
      const id = await Promise.race([resolvePasswordRecovery(getSupabaseBrowserClient().auth, href, tabStorage), deadline]);
      if (active) { setUserId(id); setPhase("ready"); }
    }).catch(reason => {
      if (active) { setError(authErrorMessage(reason)); setPhase("invalid"); }
    }).finally(() => {
      if (timeout) clearTimeout(timeout);
      if (active) window.history.replaceState(window.history.state, "", "/?auth=recovery");
    });
    return () => { active = false; if (timeout) clearTimeout(timeout); };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || phase !== "ready" || !userId) return;
    setBusy(true); setError("");
    try {
      const auth = getSupabaseBrowserClient().auth;
      await updateRecoveredPassword(auth, userId, password, confirmation);
      clearPasswordRecovery(tabStorage);
      setPassword(""); setConfirmation(""); setShowPassword(false); setShowConfirmation(false);
      setPhase("done");
      // El cambio ya está confirmado, incluso si falla el cierre de esta sesión.
      await auth.signOut({ scope: "local" }).catch(() => undefined);
    } catch (reason) { setError(authErrorMessage(reason)); }
    finally { setBusy(false); }
  };

  const requestAgain = () => {
    clearPasswordRecovery(tabStorage);
    window.location.replace("/?auth=forgot");
  };

  return <main className="login-page recovery-page">
    <section className="login-brand-panel">
      <div className="login-logo">{brand}</div>
      <div className="login-message"><span>AUTORAM COLOMBIA</span><h1>Recupera<br/><em>tu acceso.</em><br/>Sigue tu camino.</h1><p>Tus vehículos, recorridos y registros siguen en tu cuenta.</p></div>
      <div className="login-proof"><div><ShieldCheck size={18}/><span><b>Una cuenta protegida</b><small>El enlace de tu correo confirma el acceso</small></span></div></div>
    </section>
    <section className="login-form-panel"><div className="login-mobile-brand">{brand}</div><div className="login-box">
      <div className="code-icon"><LockKeyhole size={26}/></div><small className="login-over">RECUPERAR ACCESO</small>
      <h2>{phase === "done" ? "Contraseña actualizada" : "Nueva contraseña"}</h2>
      <p>{phase === "checking" ? "Estamos comprobando tu enlace de recuperación…" : phase === "done" ? "Ya puedes ingresar con tu nueva contraseña." : phase === "ready" ? "Elige una contraseña de al menos 8 caracteres y confírmala." : "Solicita un nuevo enlace para recuperar tu cuenta."}</p>
      {error && <div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
      {phase === "done" && <div className="auth-success" role="status"><Check size={16}/>Tu nueva contraseña quedó guardada.</div>}
      {phase === "ready" && <form className="auth-form" onSubmit={submit}>
        <div className="auth-password-control"><label htmlFor="recovery-password"><span>Nueva contraseña</span></label><div className="password-field"><input id="recovery-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy}/><button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar nueva contraseña" : "Ver nueva contraseña"} aria-pressed={showPassword} aria-controls="recovery-password" disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></div>
        <div className="auth-password-control"><label htmlFor="recovery-confirmation"><span>Confirmar nueva contraseña</span></label><div className="password-field"><input id="recovery-confirmation" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy}/><button className="password-toggle" type="button" aria-label={showConfirmation ? "Ocultar confirmación" : "Ver confirmación"} aria-pressed={showConfirmation} aria-controls="recovery-confirmation" disabled={busy} onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></div>
        <button className="login-main" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar nueva contraseña"}<ChevronRight size={18}/></button>
      </form>}
      {phase === "invalid" && <button className="recovery-action" type="button" onClick={requestAgain}>Solicitar otro correo<ChevronRight size={18}/></button>}
      {phase !== "checking" && <button className="auth-back" type="button" disabled={busy} onClick={() => window.location.replace("/")}>Volver a AutoRAM</button>}
      <div className="security-note"><ShieldCheck size={17}/><span>Recuperar el acceso conserva los datos de tu cuenta.</span></div>
    </div></section>
  </main>;
}
