'use client';
import { ArrowDownRight, ArrowUpRight, CarFront, ChevronRight, CircleDollarSign, Fuel, Navigation, Route, WalletCards, Wrench } from 'lucide-react';
import { JOURNEY_PERIODS, type JourneyPeriod, type summarizeJourney } from '@/lib/journey-summary';
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
type Props = {
  period: JourneyPeriod; onPeriodChange: (period: JourneyPeriod) => void;
  totals: ReturnType<typeof summarizeJourney>; active: boolean;
  vehicle: { brand: string; model: string; plate: string; odometer: string; year: string; fuel: string } | null;
  image: string; go: (view: 'trabajo' | 'navegar' | 'parque') => void;
  register: (view: 'tanqueos' | 'mantenimiento') => void;
  status?: 'ready' | 'loading' | 'error' | 'offline'; retry?: () => void;
};
export default function JourneyOverview({ period, onPeriodChange, totals, active, vehicle, image, go, register, status = 'ready', retry }: Props) {
  const label = JOURNEY_PERIODS.find(item => item.id === period)!.label;
  return <>
    <div className="journey-heading"><div><span className="ux-eyebrow">TU TRABAJO, EN PERSPECTIVA</span><h1>Mi jornada<span>.</span></h1><p>Tu vehículo y tus números, en el mismo lugar.</p></div>
      <div className="journey-periods" role="group" aria-label="Período del balance">{JOURNEY_PERIODS.map(item => <button type="button" key={item.id} aria-pressed={period === item.id} onClick={() => onPeriodChange(item.id)}>{item.label}</button>)}</div>
    </div>
    <section className="journey-overview" aria-label={`Balance: ${label}`}>
      <div className="journey-balance" aria-busy={status === 'loading'}><div className="journey-balance__top"><span><WalletCards size={18}/>{status === 'ready' ? 'BALANCE REGISTRADO' : 'MOVIMIENTOS RECIENTES'} · {label.toUpperCase()}</span><span className={`journey-work-state ${active ? 'is-active' : ''}`}><i/>{active ? 'Jornada activa' : 'Jornada sin iniciar'}</span></div>
        <span className="journey-balance__label">{totals.net < 0 ? 'Gastos por encima de ingresos' : 'Ganancia neta'}</span>
        <strong className={`journey-balance__amount ${totals.net < 0 ? 'is-negative' : ''}`}>{money.format(totals.net)}</strong>
        <p className="journey-balance__note">{totals.hasRecords ? 'Según jornadas cerradas y gastos registrados.' : 'Tu balance aparecerá cuando registres tu actividad.'}</p>
        {status !== 'ready' && <div className="journey-data-status" role="status">{status === 'loading' ? 'Actualizando el balance completo…' : status === 'offline' ? 'Copia local: el historial puede estar incompleto hasta que vuelvas a tener conexión.' : 'No pudimos actualizar el balance completo. Mostramos los movimientos recientes.'}{status === 'error' && <button type="button" onClick={retry}>Reintentar</button>}</div>}
        <div className="journey-money"><div><span><ArrowUpRight size={17}/>Ingresos</span><b>{money.format(totals.income)}</b></div><div><span><ArrowDownRight size={17}/>Gastos</span><b>{money.format(totals.expenses)}</b></div></div>
        <div className="journey-bottom"><span><Route size={17}/><b>{totals.distance.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</b> km en GPS</span><span><WalletCards size={17}/><b>{totals.closedCount}</b> jornadas cerradas</span></div>
      </div>
      <div className="journey-vehicle"><div className="journey-vehicle__title"><span className="ux-eyebrow">VEHÍCULO ACTIVO</span><span className="journey-plate">{vehicle?.plate || 'SIN PLACA'}</span></div><img src={image} alt={vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo de referencia AutoRAM'}/><div className="journey-vehicle__info"><div><h2>{vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Agrega tu vehículo'}</h2><p>{vehicle ? `${vehicle.year} · ${Number(vehicle.odometer || 0).toLocaleString('es-CO')} km` : 'Organiza sus recorridos y costos.'}</p></div><button type="button" aria-label="Ver mis vehículos" onClick={() => go('parque')}><CarFront size={20}/><ChevronRight size={16}/></button></div></div>
    </section>
    <nav className="journey-shortcuts" aria-label="Acciones rápidas"><button type="button" className="journey-shortcut--primary" onClick={() => go('trabajo')}><span><CircleDollarSign size={23}/></span><div><b>Cotizar servicio</b><small>Ruta, costos y tu precio</small></div><ChevronRight size={17}/></button><button type="button" onClick={() => go('navegar')}><span><Navigation size={23}/></span><div><b>Ir al mapa</b><small>Prepara tu recorrido</small></div><ChevronRight size={17}/></button><button type="button" onClick={() => register('tanqueos')}><span><Fuel size={23}/></span><div><b>Registrar tanqueo</b><small>Actualiza tu consumo</small></div><ChevronRight size={17}/></button><button type="button" onClick={() => register('mantenimiento')}><span><Wrench size={23}/></span><div><b>Registrar servicio</b><small>Cuida tu vehículo</small></div><ChevronRight size={17}/></button></nav>
  </>;
}
