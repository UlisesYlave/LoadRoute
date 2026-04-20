/**
 * Servicio de API — Tasf.B2B Logistics
 * Envía archivos .txt al backend y recibe resultados de algoritmos reales.
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
  escenario: number
): Promise<RutaResponse> {
  const formData = new FormData();
  formData.append('aeropuertos', aeropuertosFile);
  formData.append('vuelos', vuelosFile);
  enviosFiles.forEach(file => {
    formData.append('envios', file);
  });
  formData.append('escenario', String(escenario));

  const response = await fetch(API_ENDPOINTS.SIMULAR, {
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
