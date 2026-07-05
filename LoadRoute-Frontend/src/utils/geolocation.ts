import { AeropuertoDTO } from '@/types/rutas';

// Convierte grados a radianes
function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

// Calcula la distancia en kilómetros entre dos coordenadas usando la fórmula del Haversine
export function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Encuentra el aeropuerto más cercano a unas coordenadas dadas
export function encontrarAeropuertoMasCercano(
  lat: number,
  lon: number,
  aeropuertos: AeropuertoDTO[]
): AeropuertoDTO | null {
  if (!aeropuertos || aeropuertos.length === 0) return null;

  let masCercano: AeropuertoDTO | null = null;
  let distanciaMinima = Infinity;

  for (const aeropuerto of aeropuertos) {
    // Si no tiene latitud o longitud (ej 0,0 real es raro pero posible), lo calculamos de todos modos
    const dist = calcularDistancia(lat, lon, aeropuerto.latitud, aeropuerto.longitud);
    if (dist < distanciaMinima) {
      distanciaMinima = dist;
      masCercano = aeropuerto;
    }
  }

  return masCercano;
}

// Obtiene la ubicación actual del usuario a través del navegador
export function obtenerUbicacionNavegador(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no soportada por el navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}
