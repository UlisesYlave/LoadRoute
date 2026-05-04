/**
 * Servicio de API — Tasf.B2B Logistics
 * Envía archivos .txt al backend y recibe resultados de algoritmos reales.
 *
 * CAMBIO v3: escenario, fechaInicio y fechaFin van como @RequestParam en la URL
 * (no en el FormData), conforme al controlador Spring Boot.
 * Los archivos van como @RequestPart con sus nombres correctos.
 */

import { API_ENDPOINTS } from '@/config/constants';
import { RutaResponse, SimulacionJob } from '@/types/rutas';

/**
 * Ejecuta la simulación subiendo los 3 archivos de datos al backend.
 */
export async function ejecutarSimulacion(
  aeropuertosFile: File,
  vuelosFile: File,
  enviosFiles: File[],
  escenario: number,
  fechaInicio?: string,  // formato YYYYMMDD, opcional
  fechaFin?: string,     // formato YYYYMMDD, opcional
  onProgress?: (job: SimulacionJob) => void
): Promise<RutaResponse[]> {
  const started = await iniciarSimulacion(
    aeropuertosFile,
    vuelosFile,
    enviosFiles,
    escenario,
    fechaInicio,
    fechaFin
  );
  onProgress?.(started);

  return esperarResultadoSimulacion(started.jobId, onProgress);
}

export async function iniciarSimulacion(
  aeropuertosFile: File,
  vuelosFile: File,
  enviosFiles: File[],
  escenario: number,
  fechaInicio?: string,
  fechaFin?: string
): Promise<SimulacionJob> {
  const formData = new FormData();
  // Nombres de campo deben coincidir con @RequestPart del controlador
  formData.append('aeropuertosFile', aeropuertosFile);
  formData.append('vuelosFile', vuelosFile);
  enviosFiles.forEach(file => {
    formData.append('enviosFiles', file);
  });

  // Los @RequestParam van en la URL, no en el body multipart
  const params = new URLSearchParams({ escenario: String(escenario) });
  if (fechaInicio) params.set('fechaInicio', fechaInicio);
  if (fechaFin)    params.set('fechaFin', fechaFin);

  const response = await fetch(`${API_ENDPOINTS.SIMULAR_ASYNC}?${params.toString()}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const msg = errorBody?.error || `Error del servidor: ${response.status}`;
    throw new Error(msg);
  }

  return response.json();
}

export async function obtenerEstadoSimulacion(jobId: string): Promise<SimulacionJob> {
  const response = await fetch(`${API_ENDPOINTS.SIMULAR_ASYNC}/${jobId}`);
  if (!response.ok) {
    throw new Error(`No se pudo consultar la simulacion: ${response.status}`);
  }
  return response.json();
}

async function esperarResultadoSimulacion(
  jobId: string,
  onProgress?: (job: SimulacionJob) => void
): Promise<RutaResponse[]> {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const job = await obtenerEstadoSimulacion(jobId);
    onProgress?.(job);

    if (job.status === 'DONE' && job.chunks) {
      return job.chunks;
    }

    if (job.status === 'ERROR') {
      throw new Error(job.error || job.message || 'La simulacion fallo');
    }
  }
}

/**
 * Verifica si el backend está disponible
 */
export async function verificarSaludBackend(): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINTS.HEALTH);
    return response.ok;
  } catch {
    return false;
  }
}
