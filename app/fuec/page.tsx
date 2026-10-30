"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FormData = {
  logoData: string;
  company: string; companyNit: string; companyResolution: string; manager: string;
  fuecNumber: string; contractNumber: string; contractor: string; contractorId: string;
  purpose: string; origin: string; destination: string; startDate: string; endDate: string;
  plate: string; brand: string; model: string; vehicleClass: string; internalNumber: string;
  operationCard: string; driver: string; driverId: string; issuedAt: string;
};

const empty: FormData = {
  logoData: "", company: "", companyNit: "", companyResolution: "", manager: "", fuecNumber: "",
  contractNumber: "", contractor: "", contractorId: "", purpose: "", origin: "", destination: "",
  startDate: "", endDate: "", plate: "", brand: "", model: "", vehicleClass: "", internalNumber: "",
  operationCard: "", driver: "", driverId: "", issuedAt: new Date().toISOString().slice(0, 10),
};
const storageKey = "autoram.fuec.draft.v1";
const fields: Array<[keyof FormData, string, boolean?]> = [
  ["company", "Razón social de la empresa", true], ["companyNit", "NIT de la empresa", true],
  ["companyResolution", "Resolución de habilitación"], ["manager", "Representante / gerente autorizado", true],
  ["fuecNumber", "Consecutivo FUEC asignado por la empresa", true], ["contractNumber", "Número del contrato", true],
  ["contractor", "Contratante", true], ["contractorId", "NIT o documento del contratante"],
  ["purpose", "Objeto del contrato / servicio", true], ["origin", "Origen", true], ["destination", "Destino", true],
  ["startDate", "Inicio de vigencia", true], ["endDate", "Fin de vigencia", true],
  ["plate", "Placa", true], ["brand", "Marca", true], ["model", "Modelo", true],
  ["vehicleClass", "Clase de vehículo", true], ["internalNumber", "Número interno"],
  ["operationCard", "Tarjeta de operación", true], ["driver", "Nombre del conductor", true],
  ["driverId", "Documento del conductor", true], ["issuedAt", "Fecha de expedición", true],
];

export default function FuecPage() {
  const [form, setForm] = useState<FormData>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) setForm({ ...empty, ...JSON.parse(saved) });
      } catch { /* Si el almacenamiento local no está disponible, el formulario sigue funcionando. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(storageKey, JSON.stringify(form)); } catch { /* Guardado opcional. */ }
    }
  }, [form, ready]);

  const update = (key: keyof FormData, value: string) => setForm(current => ({ ...current, [key]: value }));
  const uploadLogo = (file?: File) => {
    setLogoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("Selecciona una imagen válida."); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError("El logo debe pesar máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setForm(current => ({ ...current, logoData: reader.result as string })); };
    reader.onerror = () => setLogoError("No pudimos leer el archivo. Intenta con otra imagen.");
    reader.readAsDataURL(file);
  };
  const print = () => {
    const missing = fields.filter(([key, , required]) => required && !form[key].trim()).map(([, label]) => label);
    if (missing.length) { setError("Completa los campos obligatorios: " + missing.join(", ") + "."); return; }
    if (form.endDate < form.startDate) { setError("La fecha de fin debe ser igual o posterior a la fecha de inicio."); return; }
    setError("");
    window.print();
  };

  return <main className="fuec-app">
    <style>{`
      *{box-sizing:border-box}.fuec-app{min-height:100vh;background:#f3f6f4;color:#17251f;padding:28px 16px 60px;font-family:Arial,sans-serif}
      .fuec-wrap{max-width:980px;margin:auto}.fuec-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:22px}
      .fuec-brand{font-weight:900;letter-spacing:.12em;color:#174b38}.fuec-brand small{display:block;font-size:10px;letter-spacing:.2em;margin-top:4px}
      .fuec-head a{color:#315e4b;text-decoration:none;font-size:14px}.fuec-card{background:white;border:1px solid #dce6df;border-radius:18px;padding:24px;box-shadow:0 12px 36px #153b2610}
      .fuec-title{margin:0;font-size:28px}.fuec-intro{color:#60736a;line-height:1.55;margin:8px 0 22px}.fuec-note{background:#fff8e7;border:1px solid #f0dfb3;color:#725721;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;margin:0 0 20px}
      .fuec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.fuec-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#31463a}
      .fuec-field input{width:100%;border:1px solid #ccd9d0;border-radius:9px;padding:11px 12px;font-size:15px;color:#17251f;background:#fff}.fuec-field input:focus{outline:3px solid #c8e4d2;border-color:#43845f}
      .fuec-section{grid-column:1/-1;margin:9px 0 0;padding-top:13px;border-top:1px solid #e7eee9;color:#24583d;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .fuec-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px}.fuec-actions button{border:0;border-radius:10px;background:#174b38;color:#fff;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer}
      .fuec-actions .secondary{background:#e6eee8;color:#28523c}.fuec-error{margin-top:14px;background:#fff0ef;color:#9b3029;border-radius:10px;padding:12px;font-size:13px;line-height:1.5}
      .fuec-paper{display:none}.fuec-logo-preview{display:flex;align-items:center;gap:12px;margin:0 0 16px}.fuec-logo-preview img{max-width:170px;max-height:72px;object-fit:contain}.fuec-paper-logo{display:block;max-width:160px;max-height:70px;object-fit:contain;margin:0 auto 12px}.fuec-label{color:#637267}.fuec-value{font-weight:700}.fuec-sign{margin-top:54px;display:flex;justify-content:space-between;gap:40px}.fuec-sign div{border-top:1px solid #333;padding-top:8px;min-width:240px;text-align:center}
      @media(max-width:640px){.fuec-app{padding:16px 10px 40px}.fuec-card{padding:18px 14px}.fuec-grid{grid-template-columns:1fr}.fuec-section{grid-column:auto}.fuec-title{font-size:24px}.fuec-actions{align-items:stretch;flex-direction:column}.fuec-actions button{width:100%}}
      @media print{ @page{size:letter portrait;margin:14mm}.fuec-app{padding:0;background:#fff}.fuec-head,.fuec-editor{display:none!important}.fuec-paper{display:block!important;color:#111;font-family:Arial,sans-serif;font-size:11pt}.fuec-paper h1{text-align:center;font-size:16pt;margin:0 0 4px}.fuec-paper h2{text-align:center;font-size:12pt;margin:0 0 20px}.fuec-paper table{border-collapse:collapse;width:100%;margin:0 0 12px}.fuec-paper td{border:1px solid #777;padding:8px;vertical-align:top;width:50%}.fuec-label{display:block;font-size:8pt;text-transform:uppercase;margin-bottom:5px}.fuec-value{display:block;min-height:15px}.fuec-disclaimer{font-size:8pt;line-height:1.4;margin-top:14px;color:#333}.fuec-sign{margin-top:55px}.fuec-sign div{min-width:42%}}
    `}</style>

    <div className="fuec-wrap">
      <header className="fuec-head"><div className="fuec-brand">AUTORAM<small>COLOMBIA · DOCUMENTOS</small></div><Link href="/">← Volver a AutoRAM</Link></header>
      <section className="fuec-card fuec-editor">
        <h1 className="fuec-title">Preparar FUEC para impresión</h1>
        <p className="fuec-intro">Completa la información del contrato y del vehículo. Los datos quedan guardados en este dispositivo para facilitar el siguiente diligenciamiento.</p>
        <p className="fuec-note"><b>Importante:</b> esta herramienta prepara una impresión. La empresa habilitada debe verificar el contrato, asignar el consecutivo oficial y autorizar o firmar el FUEC antes de usarlo en un servicio.</p>
        <div className="fuec-logo-preview"><label className="fuec-field">Logo para el membrete (PNG, JPG o WEBP · máximo 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>{form.logoData&&<img src={form.logoData} alt="Vista previa del logo de la empresa"/>}</div>{logoError&&<div className="fuec-error" role="alert">{logoError}</div>}
        <div className="fuec-grid">
          <div className="fuec-section">Empresa y contrato</div>
          {fields.slice(0, 13).map(([key,label,required]) => <label className="fuec-field" key={key}>{label}{required&&" *"}<input required={Boolean(required)} type={key==="startDate"||key==="endDate"||key==="issuedAt"?"date":"text"} value={form[key]} onChange={e=>update(key,e.target.value)}/></label>)}
          <div className="fuec-section">Vehículo y conductor</div>
          {fields.slice(13).map(([key,label,required]) => <label className="fuec-field" key={key}>{label}{required&&" *"}<input required={Boolean(required)} type={key==="startDate"||key==="endDate"||key==="issuedAt"?"date":"text"} value={form[key]} onChange={e=>update(key,e.target.value)}/></label>)}
        </div>
        {error&&<div className="fuec-error" role="alert">{error}</div>}
        <div className="fuec-actions"><button className="secondary" type="button" onClick={()=>{setForm(empty);setError("");try{localStorage.removeItem(storageKey)}catch{}}}>Limpiar formulario</button><button type="button" onClick={print}>Vista de impresión / Imprimir</button></div>
      </section>

      <article className="fuec-paper">
        {form.logoData&&<img className="fuec-paper-logo" src={form.logoData} alt="Logo de la empresa"/>}<h1>{form.company || "EMPRESA DE TRANSPORTE ESPECIAL"}</h1><h2>FORMATO ÚNICO DE EXTRACTO DEL CONTRATO · FUEC</h2>
        <table><tbody>
          <tr><td><span className="fuec-label">Número de FUEC</span><span className="fuec-value">{form.fuecNumber}</span></td><td><span className="fuec-label">NIT empresa</span><span className="fuec-value">{form.companyNit}</span></td></tr>
          <tr><td><span className="fuec-label">Número del contrato</span><span className="fuec-value">{form.contractNumber}</span></td><td><span className="fuec-label">Contratante · identificación</span><span className="fuec-value">{form.contractor} · {form.contractorId}</span></td></tr>
          <tr><td colSpan={2}><span className="fuec-label">Objeto del contrato</span><span className="fuec-value">{form.purpose}</span></td></tr>
          <tr><td><span className="fuec-label">Origen</span><span className="fuec-value">{form.origin}</span></td><td><span className="fuec-label">Destino</span><span className="fuec-value">{form.destination}</span></td></tr>
          <tr><td><span className="fuec-label">Inicio de vigencia</span><span className="fuec-value">{form.startDate}</span></td><td><span className="fuec-label">Fin de vigencia</span><span className="fuec-value">{form.endDate}</span></td></tr>
          <tr><td><span className="fuec-label">Vehículo · placa / clase</span><span className="fuec-value">{form.plate} · {form.vehicleClass}</span></td><td><span className="fuec-label">Marca / modelo / interno</span><span className="fuec-value">{form.brand} · {form.model} · {form.internalNumber}</span></td></tr>
          <tr><td><span className="fuec-label">Tarjeta de operación</span><span className="fuec-value">{form.operationCard}</span></td><td><span className="fuec-label">Conductor · identificación</span><span className="fuec-value">{form.driver} · {form.driverId}</span></td></tr>
          <tr><td><span className="fuec-label">Expedido</span><span className="fuec-value">{form.issuedAt}</span></td><td><span className="fuec-label">Resolución de habilitación</span><span className="fuec-value">{form.companyResolution}</span></td></tr>
        </tbody></table>
        <p className="fuec-disclaimer">Documento preparado desde AutoRAM. La empresa habilitada debe validar que este extracto corresponda al contrato, completar cualquier dato adicional exigible y autorizarlo conforme a su procedimiento vigente.</p>
        <div className="fuec-sign"><div><b>{form.manager}</b><br/>Representante autorizado · {form.company}</div><div>Firma autorizada de la empresa</div></div>
      </article>
    </div>
  </main>;
}
