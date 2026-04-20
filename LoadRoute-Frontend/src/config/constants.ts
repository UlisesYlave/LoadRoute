/**
 * Constantes de configuración del Frontend — Tasf.B2B Logistics
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export const API_ENDPOINTS = {
  SIMULAR: `${BACKEND_URL}/api/rutas/simular`,
  HEALTH: `${BACKEND_URL}/api/rutas/health`,
};
