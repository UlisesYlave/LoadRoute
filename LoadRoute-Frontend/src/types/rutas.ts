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
  /** Días desde la fecha de inicio del rango. Ubica el vuelo en el timeline global. */
  diaOffset: number;
}

export interface RutaMuestra {
  envioId: string;
  origen: string;
  destino: string;
  maletas: number;
  slaHoras: number;
  recepcionMinutosGMT?: number;
  recepcionDiaOffset?: number;
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
  enviosNoAceptados: number;
  totalEnvios: number;
  rutasMuestra: RutaMuestra[];
  mensajeColapso?: string;
  vuelosCanceladosIds?: number[];
}

export interface RutaResponse {
  escenario: number;
  resultadoSA: ResultadoAlgoritmo | null;
  aeropuertos: AeropuertoDTO[];
  vuelosMaestros?: TramoDTO[];
  totalVuelos: number;
  totalEnviosCargados: number;
  fechaInicio?: string;
  fechaFin?: string;
  loteInicio?: string;
  loteFin?: string;
  sa?: number;
  k?: number;
  
  // Custom frontend arrays mapped from chunks
  cancelacionesPorDiaSA?: number[][];
  chunksCount?: number;
}

export interface FiltrosAvionesMapa {
  usarOrigen: boolean;
  usarDestino: boolean;
  origenes: string[];
  destinos: string[];
  ocultarVacios: boolean;
}

export interface SimulacionJob {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR';
  progress: number;
  message: string;
  chunks?: RutaResponse[];
  chunkCount?: number;
  chunkStart?: number;
  error?: string;
  owner?: string;
}

export type AlgoritmoSeleccion = 'sa';
