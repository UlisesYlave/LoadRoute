/**
 * Tipos e interfaces TypeScript para el sistema de ruteo Tasf.B2B
 */

export interface AeropuertoDTO {
  codigo: string;
  ciudad: string;
  pais: string;
  continente: string;
  latitud: number;
  longitud: number;
  capacidadMax: number;
  gmt: number;
}

export interface TramoDTO {
  origen: string;
  destino: string;
  origenLat: number;
  origenLon: number;
  destinoLat: number;
  destinoLon: number;
  capacidad: number;
  vueloId: number;
  horaSalidaLocal: string;
  horaLlegadaLocal: string;
  salidaMinutosGMT: number;
  llegadaMinutosGMT: number;
  salidaAbsMinutos: number;
  llegadaAbsMinutos: number;
}

export interface RutaMuestra {
  envioId: string;
  origen: string;
  destino: string;
  maletas: number;
  slaHoras: number;
  recepcionAbsMinutos: number;
  tramos: TramoDTO[];
}

export interface ResultadoAlgoritmo {
  algoritmo: string;
  costoInicial: number;
  costoFinal: number;
  mejoraRelativa: number;
  iteraciones: number;
  tiempoEjecucionMs: number;
  enviosAsignados: number;
  totalEnvios: number;
  rutasMuestra: RutaMuestra[];
  mensajeColapso?: string;
}

export interface RutaResponse {
  escenario: number;
  resultadoSA: ResultadoAlgoritmo | null;
  resultadoALNS: ResultadoAlgoritmo | null;
  aeropuertos: AeropuertoDTO[];
  totalVuelos: number;
  totalEnviosCargados: number;
  fechaInicio?: string;
  fechaFin?: string;
}

export interface SimulacionJob {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR';
  progress: number;
  message: string;
  result?: RutaResponse;
  partialResult?: RutaResponse;
  error?: string;
}
