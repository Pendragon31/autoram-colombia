'use client';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
export default function ConnectionBadge() {
  const online = useOnline();
  return <span className={`connection-badge ${online ? '' : 'is-offline'}`} role="status">{online ? <Wifi size={15}/> : <WifiOff size={15}/>} {online ? 'Con conexión' : 'Sin conexión'}</span>;
}
