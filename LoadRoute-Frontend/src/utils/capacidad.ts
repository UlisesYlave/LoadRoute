import { RutaMuestra, TramoDTO } from '@/types/rutas';

export const TIEMPO_ESPERA_DESTINO = 15;

type IntervaloCargaAeropuerto = {
  inicio: number;
  fin: number;
  maletas: number;
};

function salidaTotalMinutos(t: TramoDTO): number {
  return (t.diaOffset || 0) * 1440 + t.salidaMinutosGMT;
}

function llegadaTotalMinutos(t: TramoDTO): number {
  let llegada = (t.diaOffset || 0) * 1440 + t.llegadaMinutosGMT;
  if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
    llegada += 1440;
  }
  return llegada;
}

export function calcularCargaAeropuertoActual(
  airportCode: string,
  rutas: RutaMuestra[],
  simTotalMinutos: number
): number {
  let total = 0;

  for (const ruta of rutas) {
    if (!ruta.tramos || ruta.tramos.length === 0) continue;

    const primerVuelo = ruta.tramos[0];
    const primeraSalida = salidaTotalMinutos(primerVuelo);
    const recepcionTotal = ((ruta.recepcionDiaOffset ?? primerVuelo.diaOffset) || 0) * 1440
      + (ruta.recepcionMinutosGMT ?? 0);

    if (
      airportCode === ruta.origen &&
      simTotalMinutos >= recepcionTotal &&
      simTotalMinutos <= primeraSalida
    ) {
      total += ruta.maletas;
    }

    for (let i = 0; i < ruta.tramos.length - 1; i++) {
      const vueloLlegada = ruta.tramos[i];
      const vueloSalida = ruta.tramos[i + 1];
      const llegadaEscala = llegadaTotalMinutos(vueloLlegada);
      const salidaEscala = salidaTotalMinutos(vueloSalida);

      if (
        airportCode === vueloLlegada.destino &&
        simTotalMinutos >= llegadaEscala &&
        simTotalMinutos <= salidaEscala
      ) {
        total += ruta.maletas;
      }
    }

    // Calcular ocupación en el destino final
    const ultimoVuelo = ruta.tramos[ruta.tramos.length - 1];
    const llegadaFinal = llegadaTotalMinutos(ultimoVuelo);
    if (
      airportCode === ultimoVuelo.destino &&
      simTotalMinutos >= llegadaFinal &&
      simTotalMinutos <= llegadaFinal + TIEMPO_ESPERA_DESTINO
    ) {
      total += ruta.maletas;
    }
  }

  return total;
}

function agregarIntervaloCarga(
  intervalos: Record<string, IntervaloCargaAeropuerto[]>,
  airportCode: string,
  inicio: number,
  fin: number,
  maletas: number
) {
  if (fin < inicio) return;
  if (!intervalos[airportCode]) intervalos[airportCode] = [];
  intervalos[airportCode].push({ inicio, fin, maletas });
}

export function calcularUltimasCargasAeropuertos(
  rutas: RutaMuestra[]
): Record<string, number> {
  const intervalos: Record<string, IntervaloCargaAeropuerto[]> = {};

  for (const ruta of rutas) {
    if (!ruta.tramos || ruta.tramos.length === 0) continue;

    const primerVuelo = ruta.tramos[0];
    const primeraSalida = salidaTotalMinutos(primerVuelo);
    const recepcionTotal = ((ruta.recepcionDiaOffset ?? primerVuelo.diaOffset) || 0) * 1440
      + (ruta.recepcionMinutosGMT ?? 0);

    agregarIntervaloCarga(intervalos, ruta.origen, recepcionTotal, primeraSalida, ruta.maletas);

    for (let i = 0; i < ruta.tramos.length - 1; i++) {
      const vueloLlegada = ruta.tramos[i];
      const vueloSalida = ruta.tramos[i + 1];

      agregarIntervaloCarga(
        intervalos,
        vueloLlegada.destino,
        llegadaTotalMinutos(vueloLlegada),
        salidaTotalMinutos(vueloSalida),
        ruta.maletas
      );
    }

    // Agregar intervalo de ocupación en el destino final
    const ultimoVuelo = ruta.tramos[ruta.tramos.length - 1];
    agregarIntervaloCarga(
      intervalos,
      ultimoVuelo.destino,
      llegadaTotalMinutos(ultimoVuelo),
      llegadaTotalMinutos(ultimoVuelo) + TIEMPO_ESPERA_DESTINO,
      ruta.maletas
    );
  }

  const cargas: Record<string, number> = {};

  for (const [airportCode, registros] of Object.entries(intervalos)) {
    let ultimoFin = registros[0]?.fin ?? 0;
    for (const registro of registros) {
      if (registro.fin > ultimoFin) ultimoFin = registro.fin;
    }

    const cargaFinal = registros.reduce((total, registro) => {
      if (registro.inicio <= ultimoFin && ultimoFin <= registro.fin) {
        return total + registro.maletas;
      }
      return total;
    }, 0);

    if (cargaFinal > 0) {
      cargas[airportCode] = cargaFinal;
    }
  }

  return cargas;
}

export function porcentajeOcupacion(cargaActual: number, capacidadMax: number): number {
  if (capacidadMax <= 0) return 0;
  const pct = Math.min((cargaActual / capacidadMax) * 100, 100);
  return Math.round(pct * 10) / 10;
}

/** Formatea un porcentaje para mostrar en UI (1 decimal máx., sin ceros innecesarios). */
export function formatPorcentaje(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function colorOcupacion(cargaActual: number, capacidadMax: number): string {
  if (cargaActual > capacidadMax) return 'red';
  if (cargaActual > capacidadMax * 0.8) return 'amber';
  return 'emerald';
}

export function obtenerEnviosEnAeropuertoActual(
  airportCode: string,
  rutas: RutaMuestra[],
  simTotalMinutos: number
): RutaMuestra[] {
  const result: RutaMuestra[] = [];

  for (const ruta of rutas) {
    if (!ruta.tramos || ruta.tramos.length === 0) continue;

    const primerVuelo = ruta.tramos[0];
    const primeraSalida = salidaTotalMinutos(primerVuelo);
    const recepcionTotal = ((ruta.recepcionDiaOffset ?? primerVuelo.diaOffset) || 0) * 1440
      + (ruta.recepcionMinutosGMT ?? 0);

    if (
      airportCode === ruta.origen &&
      simTotalMinutos >= recepcionTotal &&
      simTotalMinutos <= primeraSalida
    ) {
      result.push(ruta);
      continue;
    }

    for (let i = 0; i < ruta.tramos.length - 1; i++) {
      const vueloLlegada = ruta.tramos[i];
      const vueloSalida = ruta.tramos[i + 1];
      const llegadaEscala = llegadaTotalMinutos(vueloLlegada);
      const salidaEscala = salidaTotalMinutos(vueloSalida);

      if (
        airportCode === vueloLlegada.destino &&
        simTotalMinutos >= llegadaEscala &&
        simTotalMinutos <= salidaEscala
      ) {
        result.push(ruta);
        break;
      }
    }

    // Comprobar si está en su espera de destino final
    const ultimoVuelo = ruta.tramos[ruta.tramos.length - 1];
    const llegadaFinal = llegadaTotalMinutos(ultimoVuelo);
    if (
      airportCode === ultimoVuelo.destino &&
      simTotalMinutos >= llegadaFinal &&
      simTotalMinutos <= llegadaFinal + TIEMPO_ESPERA_DESTINO
    ) {
      if (!result.includes(ruta)) {
        result.push(ruta);
      }
      continue;
    }
  }

  return result;
}
