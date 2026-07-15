/**
 * Utilidades para parsear y formatear fechas de simulación.
 * Acepta los mismos formatos que el backend y ControlPanel:
 * - YYYYMMDDHHmm (12 dígitos)
 * - YYYYMMDD (8 dígitos)
 * - ISO: YYYY-MM-DDTHH:mm[:ss]
 */

export function parseFechaInicioRaw(raw?: string): Date | null {
  if (!raw) return null;

  const cleanRaw = raw.replace(/[- :T]/g, '');
  if (cleanRaw.length < 8) return null;

  const y = Number(cleanRaw.slice(0, 4));
  const m = Number(cleanRaw.slice(4, 6)) - 1;
  const d = Number(cleanRaw.slice(6, 8));
  const hh = cleanRaw.length >= 12 ? Number(cleanRaw.slice(8, 10)) : 0;
  const mm = cleanRaw.length >= 12 ? Number(cleanRaw.slice(10, 12)) : 0;

  if ([y, m, d, hh, mm].some(Number.isNaN)) return null;

  return new Date(Date.UTC(y, m, d, hh, mm));
}

export function resolverFechaInicioRaw(
  fechaInicioRaw?: string,
  resultadoFechaInicio?: string,
  loteInicio?: string,
): string {
  if (fechaInicioRaw) return fechaInicioRaw;
  if (resultadoFechaInicio) return resultadoFechaInicio;

  if (loteInicio) {
    const [datePart, timePart] = loteInicio.split('T');
    const compactDate = datePart?.replace(/-/g, '') ?? '';
    if (compactDate.length === 8) {
      if (timePart) {
        const [hh = '00', mm = '00'] = timePart.split(':');
        return `${compactDate}${hh.padStart(2, '0')}${mm.padStart(2, '0')}`;
      }
      return compactDate;
    }
  }

  return '';
}

export function formatFechaSimulacion(fechaInicioRaw: string | undefined, simMinutos: number): string {
  const fecha = parseFechaInicioRaw(fechaInicioRaw);
  if (!fecha) return '--/--/---- --:--';

  fecha.setUTCMinutes(fecha.getUTCMinutes() + (simMinutos || 0));

  const fechaPart = fecha.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const horaPart = fecha.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });

  return `${fechaPart} ${horaPart}`;
}
