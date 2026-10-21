'use client';
import { useState } from 'react';
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export type CostPart = { id: string; label: string; value: number; detail: string };
export default function CostDistribution({ parts, price, ready }: { parts: CostPart[]; price: number; ready: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = parts.find(item => item.id === selected);
  const positiveTotal = parts.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const denominator = Math.max(price, positiveTotal, 1);
  return <section className="cost-distribution" aria-label="Distribución del precio estimado"><div className="cost-distribution__heading"><div><span className="ux-eyebrow">CADA PESO, CLARO</span><h4>Así se reparte tu precio</h4></div><span>Estimación</span></div>
    {ready ? <><div className="cost-distribution__bar" aria-hidden="true">{parts.filter(item => item.value > 0).map(item => <span key={item.id} data-cost={item.id} className={selected && selected !== item.id ? 'is-muted' : ''} style={{ width: `${Math.max(0, item.value) / denominator * 100}%` }}/>)}</div>
      <div className="cost-distribution__legend">{parts.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(selected === item.id ? null : item.id)}><span className="cost-dot" data-cost={item.id}/><span>{item.label}</span><b className={item.value < 0 ? 'is-negative' : ''}>{money.format(item.value)}</b></button>)}</div>
      <p className="cost-distribution__detail" role="status">{active ? active.detail : 'Toca un concepto para conocer qué incluye.'}</p></> : <p className="cost-distribution__empty">Calcula la ruta y completa tus costos para ver cuánto queda para ti.</p>}
  </section>;
}
