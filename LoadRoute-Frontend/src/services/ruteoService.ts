/**
 * Servicio de API — Tasf.B2B Logistics
 * Envía archivos .txt al backend y recibe resultados de algoritmos reales.
 *
 * CAMBIO v3: escenario, fechaInicio y fechaFin van como @RequestParam en la URL
 * (no en el FormData), conforme al controlador Spring Boot.
 * Los archivos van como @RequestPart con sus nombres correctos.
 */

import { API_ENDPOINTS } from '@/config/constants';
import { RutaResponse } from '@/types/rutas';

/**
 * Ejecuta la simulación subiendo los 3 archivos de datos al backend.
 */
export async function ejecutarSimulacion(
  aeropuertosFile: File,
  vuelosFile: File,
  enviosFiles: File[],
  escenario: number,
  fechaInicio?: string,  // formato YYYYMMDD, opcional
  fechaFin?: string      // formato YYYYMMDD, opcional
): Promise<RutaResponse> {
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

  const response = await fetch(`${API_ENDPOINTS.SIMULAR}?${params.toString()}`, {
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
