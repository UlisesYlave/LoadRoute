import { RutaMuestra, TramoDTO } from '@/types/rutas';

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
  }

  return total;
}

export function porcentajeOcupacion(cargaActual: number, capacidadMax: number): number {
  if (capacidadMax <= 0) return 0;
  return Math.min((cargaActual / capacidadMax) * 100, 100);
}

export function colorOcupacion(cargaActual: number, capacidadMax: number): string {
  if (cargaActual > capacidadMax) return 'red';
  if (cargaActual > capacidadMax * 0.8) return 'amber';
  return 'emerald';
}
