import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default function configure(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY antes de publicar AutoRAM.");
    if (!URL.canParse(url) || new URL(url).protocol !== "https:") throw new Error("NEXT_PUBLIC_SUPABASE_URL debe ser una URL HTTPS válida.");
    if (key.startsWith("sb_secret_")) throw new Error("Usa una clave publicable de Supabase en el navegador.");
    if (key.startsWith("eyJ")) {
      try { if (JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role !== "anon") throw new Error("role"); }
      catch { throw new Error("La clave del navegador debe ser publicable o anon, nunca service_role."); }
    }
  }
  return nextConfig;
}
