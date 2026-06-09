const TZ = 'America/Bogota';

export function nowColombiaSqlDatetime() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** YYYY-MM-DD en calendario Colombia. */
export function fechaHoyColombiaYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function ymdColombiaDesdeValor(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const datePart = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePart) return datePart[1];
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

export function anioColombiaDesdeValor(value) {
  const ymd = ymdColombiaDesdeValor(value);
  return ymd ? Number(ymd.slice(0, 4)) : null;
}
