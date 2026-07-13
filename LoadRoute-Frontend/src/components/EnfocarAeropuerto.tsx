import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface EnfocarAeropuertoProps {
  aeropuertoAEnfocar: any | null;
}

export const EnfocarAeropuerto: React.FC<EnfocarAeropuertoProps> = ({ aeropuertoAEnfocar }) => {
  const map = useMap();
  const prevCodigo = useRef<string | null>(null);

  useEffect(() => {
    if (!aeropuertoAEnfocar) {
      prevCodigo.current = null;
      return;
    }

    // Comparamos por el código único del aeropuerto (ej: "LIM", "CDG")
    if (aeropuertoAEnfocar.codigo !== prevCodigo.current) {
      const lat = aeropuertoAEnfocar.latitud ?? aeropuertoAEnfocar.lat;
      const lon = aeropuertoAEnfocar.longitud ?? aeropuertoAEnfocar.lon;

      if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
        
        // Ejecutamos el vuelo cinemático idéntico al del avión
        map.flyTo([lat, lon], 6, {
          animate: true,
          duration: 1.5,
        });

        prevCodigo.current = aeropuertoAEnfocar.codigo;
      }
    }
  }, [aeropuertoAEnfocar?.codigo, map]);

  return null;
};
