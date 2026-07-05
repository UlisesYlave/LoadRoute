/**
 * Servicio de API — Tasf.B2B Logistics
 * Envía archivos .txt al backend y recibe resultados de algoritmos reales.
 *
 * CAMBIO v3: escenario, fechaInicio y fechaFin van como @RequestParam en la URL
 * (no en el FormData), conforme al controlador Spring Boot.
 * Los archivos van como @RequestPart con sus nombres correctos.
 */

import { API_ENDPOINTS } from '@/config/constants';
import { AlgoritmoSeleccion, RutaResponse, SimulacionJob } from '@/types/rutas';

/**
 * Genera o recupera el Session ID para identificar al dueño de la simulación.
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('sessionId');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('sessionId', sid);
  }
  return sid;
}

/**
 * Ejecuta la simulación subiendo los 3 archivos de datos al backend.
 */
export async function ejecutarSimulacion(
  aeropuertosFile: File | undefined,
  vuelosFile: File | undefined,
  enviosFiles: File[] | undefined,
  escenario: number,
  fechaInicio?: string,  // formato YYYYMMDD o YYYYMMDDHHmm, opcional
  fechaFin?: string,     // formato YYYYMMDD o YYYYMMDDHHmm, opcional
  algoritmos: AlgoritmoSeleccion = 'sa',
  sa?: number,
  k?: number,
  onProgress?: (job: SimulacionJob) => void,
  signal?: AbortSignal
): Promise<RutaResponse[]> {
  const started = await iniciarSimulacion(
    aeropuertosFile,
    vuelosFile,
    enviosFiles,
    escenario,
    fechaInicio,
    fechaFin,
    algoritmos,
    sa,
    k
  );
  onProgress?.(started);

  return esperarResultadoSimulacion(started.jobId, onProgress, signal);
}

export async function iniciarSimulacion(
  aeropuertosFile: File | undefined,
  vuelosFile: File | undefined,
  enviosFiles: File[] | undefined,
  escenario: number,
  fechaInicio?: string,
  fechaFin?: string,
  algoritmos: AlgoritmoSeleccion = 'sa',
  sa?: number,
  k?: number
): Promise<SimulacionJob> {
  const formData = new FormData();
  // Nombres de campo deben coincidir con @RequestPart del controlador
  if (aeropuertosFile) {
    formData.append('aeropuertosFile', aeropuertosFile);
  }
  if (vuelosFile) {
    formData.append('vuelosFile', vuelosFile);
  }
  if (enviosFiles) {
    enviosFiles.forEach(file => {
      formData.append('enviosFiles', file);
    });
  }

  // Los @RequestParam van en la URL, no en el body multipart
  const params = new URLSearchParams({ escenario: String(escenario) });
  if (fechaInicio) params.set('fechaInicio', fechaInicio);
  if (fechaFin) params.set('fechaFin', fechaFin);
  params.set('algoritmos', algoritmos);
  if (sa !== undefined) params.set('sa', String(sa));
  if (k !== undefined) params.set('k', String(k));

  const response = await fetch(`${API_ENDPOINTS.SIMULAR_ASYNC}?${params.toString()}`, {
    method: 'POST',
    body: formData,
    headers: {
      'X-Session-ID': getSessionId()
    }
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

export async function obtenerChunksSimulacion(jobId: string, desde = 0): Promise<SimulacionJob> {
  const params = new URLSearchParams({ desde: String(Math.max(0, desde)) });
  const response = await fetch(`${API_ENDPOINTS.SIMULAR_ASYNC}/${jobId}/chunks?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`No se pudieron descargar los resultados: ${response.status}`);
  }
  return response.json();
}

export async function eliminarSimulacion(jobId: string): Promise<void> {
  const response = await fetch(`${API_ENDPOINTS.SIMULAR_ASYNC}/${jobId}`, {
    method: 'DELETE',
    headers: {
      'X-Session-ID': getSessionId()
    }
  });
  if (response.status === 403) {
    throw new Error("No tienes permisos para detener esta simulación.");
  }
}

async function esperarResultadoSimulacion(
  jobId: string,
  onProgress?: (job: SimulacionJob) => void,
  signal?: AbortSignal
): Promise<RutaResponse[]> {
  let chunksCargados = 0;
  const todosLosChunks: RutaResponse[] = [];

  while (true) {
    if (signal?.aborted) {
      throw new Error("Simulación cancelada por el usuario");
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 1000);
      
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error("Simulación cancelada por el usuario"));
      };
      
      signal?.addEventListener('abort', onAbort);
    });

    if (signal?.aborted) {
      throw new Error("Simulación cancelada por el usuario");
    }

    try {
      const jobStatus = await obtenerEstadoSimulacion(jobId);

      // Fetch missing chunks if the backend reports there are new ones
      if (jobStatus.chunkCount && jobStatus.chunkCount > chunksCargados) {
        try {
          const jobWithChunks = await obtenerChunksSimulacion(jobId, chunksCargados);
          if (jobWithChunks.chunks && jobWithChunks.chunks.length > 0) {
            todosLosChunks.push(...jobWithChunks.chunks);
            chunksCargados += jobWithChunks.chunks.length;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes("404")) {
            throw new Error("SIMULATION_STOPPED_BY_OWNER");
          }
          console.warn("No se pudieron cargar nuevos chunks progresivos", err);
        }
      }

      // Pass the accumulated chunks back to the progress handler so the map can render them
      const currentJob: SimulacionJob = {
        ...jobStatus,
        chunks: todosLosChunks,
        chunkCount: chunksCargados
      };
      
      onProgress?.(currentJob);

      if (jobStatus.status === 'DONE') {
        return todosLosChunks;
      }

      if (jobStatus.status === 'ERROR') {
        throw new Error(jobStatus.error || jobStatus.message || 'La simulacion fallo');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === "SIMULATION_STOPPED_BY_OWNER" || msg.includes("404")) {
        throw new Error("SIMULATION_STOPPED_BY_OWNER");
      }
      throw err;
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

export async function cancelarVuelo(vueloId: number, fecha: string, escenario?: number): Promise<string> {
  const params = new URLSearchParams({ fecha });
  if (escenario !== undefined) params.set('escenario', String(escenario));
  const response = await fetch(`${API_ENDPOINTS.VUELOS}/${vueloId}/cancelar?${params.toString()}`, {
    method: 'POST',
    headers: {
      'X-Session-ID': getSessionId()
    }
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(msg || `Error al cancelar el vuelo: ${response.status}`);
  }
  return response.text();
}

export async function reactivarVuelo(vueloId: number, fecha: string, escenario?: number): Promise<string> {
  const params = new URLSearchParams({ fecha });
  if (escenario !== undefined) params.set('escenario', String(escenario));
  const response = await fetch(`${API_ENDPOINTS.VUELOS}/${vueloId}/reactivar?${params.toString()}`, {
    method: 'POST',
    headers: {
      'X-Session-ID': getSessionId()
    }
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(msg || `Error al reactivar el vuelo: ${response.status}`);
  }
  return response.text();
}

export async function obtenerVuelosCancelados(escenario?: number): Promise<{ id: number; vueloId: number; fecha: string }[]> {
  const params = new URLSearchParams();
  if (escenario !== undefined) params.set('escenario', String(escenario));
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_ENDPOINTS.VUELOS}/cancelados${queryString}`);
  if (!response.ok) {
    throw new Error(`Error al obtener vuelos cancelados: ${response.status}`);
  }
  return response.json();
}
