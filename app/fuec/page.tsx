"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Driver = { name: string; document: string; license: string; licenseExpiry: string };
type FormData = {
  logoData: string; company: string; companyNit: string; companyResolution: string;
  fuecNumber: string; validationCode: string; contractNumber: string; contractor: string;
  contractorId: string; purpose: string; origin: string; destination: string; collaboration: string;
  startDate: string; endDate: string; plate: string; modelYear: string; brand: string;
  vehicleClass: string; internalNumber: string; operationCard: string; drivers: Driver[];
  contractorContact: string; contractorPhone: string; contractorAddress: string;
  companyAddress: string; companyPhone: string; companyEmail: string; manager: string; issuedAt: string;
};
const blankDriver: Driver = { name: "", document: "", license: "", licenseExpiry: "" };
const empty: FormData = {
  logoData: "", company: "", companyNit: "", companyResolution: "", fuecNumber: "", validationCode: "",
  contractNumber: "", contractor: "", contractorId: "", purpose: "", origin: "", destination: "",
  collaboration: "", startDate: "", endDate: "", plate: "", modelYear: "", brand: "", vehicleClass: "",
  internalNumber: "", operationCard: "", drivers: [{ ...blankDriver }, { ...blankDriver }, { ...blankDriver }],
  contractorContact: "", contractorPhone: "", contractorAddress: "", companyAddress: "", companyPhone: "",
  companyEmail: "", manager: "", issuedAt: new Date().toISOString().slice(0, 10),
};
const storageKey = "autoram.fuec.draft.v2";
const dateLabel = (value: string) => value ? value.split("-").reverse().join("/") : "—";
const fixedFields: Array<[keyof FormData, string, boolean?]> = [
  ["company", "Razón social empresa transporte especial", true], ["companyNit", "NIT empresa", true],
  ["companyResolution", "Resolución de habilitación"], ["fuecNumber", "Número / consecutivo FUEC", true],
  ["validationCode", "Código interno de validación (si aplica)"], ["contractNumber", "Número de contrato", true],
  ["contractor", "Contratante", true], ["contractorId", "NIT o cédula del contratante", true],
  ["purpose", "Objeto del contrato", true], ["origin", "Origen", true], ["destination", "Destino", true],
  ["collaboration", "Convenio de colaboración (si aplica)"], ["startDate", "Fecha inicial", true], ["endDate", "Fecha de vencimiento", true],
  ["plate", "Placa", true], ["modelYear", "Modelo / año", true], ["brand", "Marca", true], ["vehicleClass", "Clase", true],
  ["internalNumber", "Número interno", true], ["operationCard", "Número tarjeta de operación", true],
  ["contractorContact", "Responsable del contratante", true], ["contractorPhone", "Teléfono del responsable"],
  ["contractorAddress", "Dirección del responsable"], ["companyAddress", "Dirección empresa", true],
  ["companyPhone", "Teléfono empresa", true], ["companyEmail", "Correo empresa"], ["manager", "Representante autorizado", true],
  ["issuedAt", "Fecha de expedición", true],
];

export default function FuecPage() {
  const [form, setForm] = useState<FormData>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(storageKey); if (saved) setForm({ ...empty, ...JSON.parse(saved) }); }
      catch { /* El formulario funciona aunque el navegador no permita guardar localmente. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(storageKey, JSON.stringify(form)); } catch { /* Guardado local opcional. */ } } }, [form, ready]);
  const update = (key: keyof FormData, value: string) => setForm(current => ({ ...current, [key]: value }));
  const updateDriver = (index: number, key: keyof Driver, value: string) => setForm(current => ({
    ...current, drivers: current.drivers.map((driver, i) => i === index ? { ...driver, [key]: value } : driver),
  }));
  const uploadLogo = (file?: File) => {
    setLogoError(""); if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setLogoError("Usa un archivo PNG, JPG o WEBP."); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError("El logo debe pesar máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setForm(current => ({ ...current, logoData: reader.result as string })); };
    reader.onerror = () => setLogoError("No pudimos leer el archivo."); reader.readAsDataURL(file);
  };
  const print = () => {
    const missing = fixedFields.filter(([key, , required]) => required && !String(form[key] ?? "").trim()).map(([, label]) => label);
    if (!form.drivers[0].name.trim() || !form.drivers[0].document.trim() || !form.drivers[0].license.trim()) missing.push("Datos del conductor 1");
    if (missing.length) { setError("Completa los campos obligatorios: " + missing.join(", ") + "."); return; }
    if (form.endDate < form.startDate) { setError("La fecha de vencimiento debe ser igual o posterior a la inicial."); return; }
    setError(""); window.print();
  };
  const field = (key: keyof FormData, label: string, required = false) => <label className="fuec-field" key={key}>{label}{required && " *"}
    <input required={required} type={["startDate", "endDate", "issuedAt"].includes(key) ? "date" : "text"} value={String(form[key] ?? "")} onChange={e => update(key, e.target.value)} />
  </label>;

  return <main className="fuec-app">
    <style>{`
      *{box-sizing:border-box}.fuec-app{min-height:100vh;background:#f3f6f4;color:#17251f;padding:24px 14px 50px;font-family:Arial,sans-serif}
      .fuec-wrap{max-width:1000px;margin:auto}.fuec-head{display:flex;justify-content:space-between;align-items:center;margin:0 auto 20px}.fuec-brand{font-weight:900;letter-spacing:.12em;color:#174b38}.fuec-brand small{display:block;font-size:10px;letter-spacing:.2em;margin-top:4px}.fuec-head a{color:#315e4b;text-decoration:none;font-size:14px}
      .fuec-card{background:white;border:1px solid #dce6df;border-radius:18px;padding:23px;box-shadow:0 12px 36px #153b2610}.fuec-title{margin:0;font-size:27px}.fuec-intro{color:#60736a;line-height:1.5;margin:8px 0 18px}.fuec-note{background:#fff8e7;border:1px solid #f0dfb3;color:#725721;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;margin:0 0 18px}
      .fuec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fuec-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#31463a}.fuec-field input{width:100%;border:1px solid #ccd9d0;border-radius:9px;padding:10px 11px;font-size:15px;color:#17251f;background:#fff}.fuec-field input:focus{outline:3px solid #c8e4d2;border-color:#43845f}
      .fuec-section{grid-column:1/-1;margin:8px 0 0;padding-top:13px;border-top:1px solid #e7eee9;color:#24583d;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.fuec-logo-preview{display:flex;align-items:center;gap:14px;margin:0 0 17px}.fuec-logo-preview img{max-width:170px;max-height:72px;object-fit:contain}.driver-inputs{grid-column:1/-1;border:1px solid #e3ebe5;border-radius:12px;padding:12px}.driver-inputs b{display:block;margin-bottom:9px;color:#28523c}.driver-inputs .fuec-grid{grid-template-columns:repeat(4,minmax(0,1fr)}
      .fuec-actions{display:flex;justify-content:space-between;gap:12px;margin-top:20px}.fuec-actions button{border:0;border-radius:10px;background:#174b38;color:#fff;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer}.fuec-actions .secondary{background:#e6eee8;color:#28523c}.fuec-error{margin-top:12px;background:#fff0ef;color:#9b3029;border-radius:10px;padding:12px;font-size:13px;line-height:1.5}
      .fuec-paper{display:none}.fuec-paper-logo{max-width:165px;max-height:58px;object-fit:contain}.paper-header{display:grid;grid-template-columns:1fr 1fr;align-items:center;text-align:center;gap:20px;margin-bottom:10px}.agency-wordmark{font-weight:800;color:#b9653f;font-size:22px}.agency-wordmark small{display:block;color:#283d6b;font-size:9px;letter-spacing:.13em}.paper-title{text-align:center;font-size:12pt;font-weight:bold;margin:10px 0 2px}.paper-number{text-align:center;font-size:11pt;margin-bottom:15px}.paper-meta{display:grid;grid-template-columns:210px 1fr;row-gap:4px;margin-bottom:14px}.paper-meta b{font-size:9pt}.paper-meta span{font-size:9pt}.paper-table{border-collapse:collapse;width:100%;margin:0 0 12px;font-size:8pt}.paper-table th,.paper-table td{border:1px solid #555;padding:5px 6px;text-align:center;vertical-align:middle}.paper-table th{font-weight:bold}.paper-table td b{display:block;text-align:left;font-size:7pt}.paper-table td span{display:block;margin-top:2px}.paper-section{text-align:center;font-weight:bold;font-size:9pt;margin:11px 0 5px}.paper-contact{display:grid;grid-template-columns:1fr 1fr;border:1px solid #555;margin-top:10px;min-height:78px}.paper-contact div{padding:12px;text-align:center;font-size:8pt}.paper-contact div+div{border-left:1px solid #555}.paper-disclaimer{font-size:7pt;line-height:1.35;color:#333;margin:9px 0}.paper-bottom{display:grid;grid-template-columns:1fr .55fr 1.2fr;border:1px solid #555;min-height:68px}.paper-bottom div{padding:7px;text-align:center;align-content:center;font-size:7pt}.paper-bottom div+div{border-left:1px solid #555}.qr-placeholder{border:1px dashed #777;display:inline-flex!important;width:48px;height:48px;margin:auto;align-items:center;justify-content:center;font-size:7pt!important}.paper-sign{min-height:80px}.fuec-watermark{display:none}
      @media(max-width:700px){.fuec-app{padding:14px 9px 36px}.fuec-card{padding:17px 13px}.fuec-grid,.driver-inputs .fuec-grid{grid-template-columns:1fr}.fuec-section,.driver-inputs{grid-column:auto}.fuec-title{font-size:23px}.fuec-actions{flex-direction:column}.fuec-actions button{width:100%}}
      @media print{@page{size:A3 portrait;margin:16mm}.fuec-app{padding:0;background:#fff}.fuec-head,.fuec-editor{display:none!important}.fuec-paper{display:block!important;color:#111;font-family:Arial,sans-serif;font-size:9pt;position:relative}.fuec-watermark{display:block;position:fixed;top:44%;left:8%;z-index:9;transform:rotate(-28deg);font-size:42pt;font-weight:bold;color:rgba(180,25,25,.16);pointer-events:none}.paper-meta{grid-template-columns:210px 1fr}.paper-table{page-break-inside:avoid}.paper-table td,.paper-table th{padding:6px}.fuec-paper-logo{max-width:180px;max-height:68px}.paper-contact{min-height:92px}.paper-sign{min-height:90px}}
    `}</style>
    <div className="fuec-wrap">
      <header className="fuec-head"><div className="fuec-brand">AUTORAM<small>COLOMBIA · DOCUMENTOS</small></div><Link href="/">← Volver a AutoRAM</Link></header>
      <section className="fuec-card fuec-editor">
        <h1 className="fuec-title">FUEC · formato de impresión</h1>
        <p className="fuec-intro">Ajustado al extracto de referencia que compartiste: membrete de empresa, datos del contrato, vigencia, vehículo, tres conductores, responsable y zona de validación.</p>
        <p className="fuec-note"><b>Importante:</b> AutoRAM prepara la hoja. El consecutivo, contenido, firma y validez deben ser confirmados por la empresa habilitada. Esta versión no crea un QR de verificación oficial.</p>
        <div className="fuec-logo-preview"><label className="fuec-field">Logo de empresa para el membrete · PNG, JPG o WEBP · máximo 2 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>{form.logoData&&<img src={form.logoData} alt="Vista previa del logo"/>}</div>{logoError&&<div className="fuec-error" role="alert">{logoError}</div>}
        <div className="fuec-grid">
          <div className="fuec-section">Empresa y extracto</div>{fixedFields.slice(0,5).map(([key,label,required])=>field(key,label,required))}
          <div className="fuec-section">Contrato y recorrido</div>{fixedFields.slice(5,14).map(([key,label,required])=>field(key,label,required))}
          <div className="fuec-section">Vehículo</div>{fixedFields.slice(14,20).map(([key,label,required])=>field(key,label,required))}
          <div className="fuec-section">Conductores · conductor 1 obligatorio</div>
          {form.drivers.map((driver,index)=><div className="driver-inputs" key={index}><b>Conductor {index+1}{index===0?" · requerido":" · opcional"}</b><div className="fuec-grid">
            <label className="fuec-field">Nombres y apellidos<input value={driver.name} onChange={e=>updateDriver(index,"name",e.target.value)}/></label>
            <label className="fuec-field">Cédula<input value={driver.document} onChange={e=>updateDriver(index,"document",e.target.value)}/></label>
            <label className="fuec-field">Número de licencia<input value={driver.license} onChange={e=>updateDriver(index,"license",e.target.value)}/></label>
            <label className="fuec-field">Vigencia licencia<input type="date" value={driver.licenseExpiry} onChange={e=>updateDriver(index,"licenseExpiry",e.target.value)}/></label>
          </div></div>)}
          <div className="fuec-section">Responsable y firma</div>{fixedFields.slice(20).map(([key,label,required])=>field(key,label,required))}
        </div>
        {error&&<div className="fuec-error" role="alert">{error}</div>}
        <div className="fuec-actions"><button className="secondary" type="button" onClick={()=>{setForm(empty);setError("");setLogoError("");try{localStorage.removeItem(storageKey)}catch{}}}>Limpiar formulario</button><button type="button" onClick={print}>Vista de impresión / Imprimir</button></div>
      </section>
      <article className="fuec-paper">
        <div className="fuec-watermark">MUESTRA · NO VÁLIDO</div>
        <header className="paper-header"><div className="agency-wordmark">Transporte especial<small>MODELO DE REFERENCIA · NO ES LOGO OFICIAL</small></div>{form.logoData?<img className="fuec-paper-logo" src={form.logoData} alt="Logo empresa"/>:<div className="agency-wordmark">LOGO<br/>EMPRESA</div>}</header>
        <div className="paper-title">FORMATO ÚNICO DEL EXTRACTO DE CONTRATO DEL SERVICIO PÚBLICO DE<br/> TRANSPORTE TERRESTRE AUTOMOTOR ESPECIAL</div>
        <div className="paper-number"># {form.fuecNumber} {form.validationCode&&<span> · Código: {form.validationCode}</span>}</div>
        <div className="paper-meta"><b>RAZÓN SOCIAL EMPRESA TRANSP. ESPECIAL:</b><span>{form.company}</span><b>NIT:</b><span>{form.companyNit}</span><b>CONTRATO No:</b><span>{form.contractNumber}</span><b>CONTRATANTE:</b><span>{form.contractor}</span><b>NIT/CC:</b><span>{form.contractorId}</span><b>OBJETO DE CONTRATO:</b><span>{form.purpose}</span><b>ORIGEN - DESTINO:</b><span>{form.origin} — {form.destination}</span><b>CONVENIO DE COLABORACIÓN:</b><span>{form.collaboration||"No aplica"}</span></div>
        <div className="paper-section">VIGENCIA DEL CONTRATO</div><table className="paper-table"><tbody><tr><th>FECHA INICIAL</th><th>DÍA</th><th>MES</th><th>AÑO</th></tr><tr><td>Inicio</td><td>{form.startDate?form.startDate.slice(8,10):"—"}</td><td>{form.startDate?form.startDate.slice(5,7):"—"}</td><td>{form.startDate?form.startDate.slice(0,4):"—"}</td></tr><tr><th>FECHA VENCIMIENTO</th><td colSpan={3}>{dateLabel(form.endDate)}</td></tr></tbody></table>
        <div className="paper-section">CARACTERÍSTICAS DEL VEHÍCULO</div><table className="paper-table"><tbody><tr><th>PLACA</th><th>MODELO</th><th>MARCA</th><th>CLASE</th></tr><tr><td>{form.plate}</td><td>{form.modelYear}</td><td>{form.brand}</td><td>{form.vehicleClass}</td></tr><tr><th colSpan={2}>NÚMERO INTERNO</th><th colSpan={2}>NÚMERO TARJETA OPERACIÓN</th></tr><tr><td colSpan={2}>{form.internalNumber}</td><td colSpan={2}>{form.operationCard}</td></tr></tbody></table>
        <table className="paper-table"><tbody>{form.drivers.map((driver,index)=><tr key={index}><td>Conductor {index+1}</td><td><b>Nombres y apellidos</b>{driver.name||"N/A"}</td><td><b>No. Cédula</b>{driver.document||"N/A"}</td><td><b>No. Licencia</b>{driver.license||"N/A"}</td><td><b>Vigencia</b>{dateLabel(driver.licenseExpiry)}</td></tr>)}<tr><td>Responsable del contratante</td><td><b>Nombres y apellidos</b>{form.contractorContact}</td><td><b>No. Cédula</b>{form.contractorId}</td><td><b>Teléfono</b>{form.contractorPhone||"—"}</td><td><b>Dirección</b>{form.contractorAddress||"—"}</td></tr></tbody></table>
        <div className="paper-contact"><div><b>{form.company}</b><br/>{form.companyAddress}<br/>Tel. {form.companyPhone}<br/>{form.companyEmail}</div><div className="paper-sign"><b>{form.manager}</b><br/>Representante autorizado<br/>Firma autorizada de la empresa<br/><small>Firma digital: completar según mecanismo de la empresa</small></div></div>
        <p className="paper-disclaimer">MUESTRA FICTICIA DE DISEÑO. No es un extracto oficial ni tiene firma digital válida. Solo la empresa habilitada puede expedir y autorizar el FUEC correspondiente al servicio.</p>
        <div className="paper-bottom"><div>Extracto válido hasta:<br/><b>{dateLabel(form.endDate)}</b><br/>Expedido el: {dateLabel(form.issuedAt)}</div><div><span className="qr-placeholder">QR<br/>NO ACTIVO</span></div><div>Verificación en línea<br/><b>No configurada en esta versión de AutoRAM</b><br/>Código de referencia: {form.validationCode||"No asignado"}</div></div>
      </article>
    </div>
  </main>;
}
