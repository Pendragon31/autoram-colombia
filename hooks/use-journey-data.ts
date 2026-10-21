'use client';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchJourneyRecords } from '@/lib/journey-data';
import { journeyBounds, mergeJourneyRecords, summarizeJourney, type JourneyPeriod, type JourneyRecords } from '@/lib/journey-summary';
import { useOnline } from '@/hooks/use-online';

export function useJourneyData(vehicleId: number | undefined, records: JourneyRecords, period: JourneyPeriod, now: number) {
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const renderNow = now;
  const start = journeyBounds(period, new Date(renderNow)).start;
  const key = `${vehicleId}:${period}:${start}:${attempt}`;
  const [result, setResult] = useState<{ key: string; records: JourneyRecords | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!vehicleId || vehicleId < 0 || !online) return;
    const controller = new AbortController(); let alive = true;
    const timeout = setTimeout(() => { controller.abort(); if (alive) setResult({ key, records: null, failed: true }); }, 15000);
    void fetchJourneyRecords(getSupabaseBrowserClient(), vehicleId, period, new Date(), controller.signal)
      .then(data => { if (alive && !controller.signal.aborted) setResult({ key, records: data, failed: false }); })
      .catch(() => { if (alive && !controller.signal.aborted) { controller.abort(); setResult({ key, records: null, failed: true }); } })
      .finally(() => clearTimeout(timeout));
    return () => { alive = false; controller.abort(); clearTimeout(timeout); };
  }, [vehicleId, period, start, online, key]);
  const current = result?.key === key ? result : null;
  const status: 'ready'|'loading'|'error'|'offline' = !online || (vehicleId !== undefined && vehicleId <= 0) ? 'offline' : current?.failed ? 'error' : current?.records || !vehicleId ? 'ready' : 'loading';
  const all = current?.records ? mergeJourneyRecords(current.records, records) : records;
  return { totals: summarizeJourney(all, period, new Date(renderNow)), status, retry: () => setAttempt(value => value + 1) };
}
