'use client';

import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  CircleMarker,
  Tooltip,
  ZoomControl,
} from 'react-leaflet';
import L from 'leaflet';
import { RutaResponse, AeropuertoDTO } from '@/types/rutas';
import 'leaflet/dist/leaflet.css';

type ModoMapa = 'sa' | 'alns' | 'ambos';

interface MapaRutasProps {
  resultado: RutaResponse | null;
  simDia: number;
  simTiempoMinutos: number;
  onSelectVuelo: (vuelo: any) => void;
  selectedVuelo?: any | null;  // tramo seleccionado — dibuja solo su polilínea
  umbralVerde: number;
  umbralAmbar: number;
  modoMapa: ModoMapa;
  onModoMapa: (modo: ModoMapa) => void;
}

// Semáforo dinámico de Aeropuertos (por % de ocupación real)
function getAirportColor(cargaActual: number, capacidadMax: number, umbralVerde: number, umbralAmbar: number): string {
  if (capacidadMax <= 0) return '#10b981';
  const p = (cargaActual / capacidadMax) * 100;
  if (p <= umbralVerde) return '#10b981';
  if (p <= umbralAmbar) return '#f59e0b';
  return '#ef4444';
}

// Semáforo dinámico de Aviones
function getPlaneColor(cargaActual: number, capacidadMax: number, umbralVerde: number, umbralAmbar: number): string {
  const p = (cargaActual / Math.max(capacidadMax, 1)) * 100;
  if (p <= umbralVerde) return '#10b981';
  if (p <= umbralAmbar) return '#f59e0b';
  return '#ef4444';
}

// Componente para ajustar el mapa a los bounds
const AjustadorMapa: React.FC<{ aeropuertos: AeropuertoDTO[] }> = ({ aeropuertos }) => {
  const map = useMap();

  useEffect(() => {
    if (aeropuertos.length === 0) return;

    const bounds = L.latLngBounds(
      aeropuertos.map(a => [a.latitud, a.longitud] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  }, [aeropuertos, map]);

  return null;
};

// Iconos de avión según semáforo
function crearIconoAvion(color: string, angle: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="color:${color};font-size:20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));transform:rotate(${angle - 45}deg);line-height:20px;width:20px;height:20px;text-align:center;">✈</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function MapaRutas({
  resultado,
  simDia,
  simTiempoMinutos,
  onSelectVuelo,
  selectedVuelo,
  umbralVerde,
  umbralAmbar,
  modoMapa,
  onModoMapa,
}: MapaRutasProps) {
  const aeropuertos = resultado?.aeropuertos || [];
  const resultadoSA = resultado?.resultadoSA;
  const resultadoALNS = resultado?.resultadoALNS;
  const mostrarSA = modoMapa === 'sa' || modoMapa === 'ambos' || !resultadoALNS;
  const mostrarALNS = modoMapa === 'alns' || modoMapa === 'ambos';

  const tramosSA = resultadoSA?.rutasMuestra?.flatMap(r => r.tramos) || [];
  const tramosALNS = resultadoALNS?.rutasMuestra?.flatMap(r => r.tramos) || [];

  const uniqueTramosLineasSA = deduplicarTramosLineas(tramosSA);
  const uniqueTramosLineasALNS = deduplicarTramosLineas(tramosALNS);

  const absoluteCurrentMinute = simDia * 1440 + simTiempoMinutos;

  const activePlanesSA = getActiveFlights(tramosSA, absoluteCurrentMinute);
  const activePlanesALNS = getActiveFlights(tramosALNS, absoluteCurrentMinute);

  // OPTIMIZACIÓN: Precalcular cargas de vuelos una sola vez por resultado
  const flightLoadsSA = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of (resultadoSA?.rutasMuestra || [])) {
      if (!r.tramos) continue;
      for (const t of r.tramos) map.set(t.vueloId, (map.get(t.vueloId) || 0) + r.maletas);
    }
    return map;
  }, [resultadoSA]);

  const flightLoadsALNS = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of (resultadoALNS?.rutasMuestra || [])) {
      if (!r.tramos) continue;
      for (const t of r.tramos) map.set(t.vueloId, (map.get(t.vueloId) || 0) + r.maletas);
    }
    return map;
  }, [resultadoALNS]);

  // OPTIMIZACIÓN: Calcular cargas de aeropuertos en UNA SOLA PASADA (O(R) en vez de O(A*R))
  const airportLoads = useMemo(() => {
    const rutasParaCarga = modoMapa === 'sa'
      ? (resultadoSA?.rutasMuestra || [])
      : modoMapa === 'alns'
        ? (resultadoALNS?.rutasMuestra || resultadoSA?.rutasMuestra || [])
        : [...(resultadoSA?.rutasMuestra || []), ...(resultadoALNS?.rutasMuestra || [])];
    
    return computeAllAirportLoads(rutasParaCarga, absoluteCurrentMinute);
  }, [resultadoSA, resultadoALNS, modoMapa, absoluteCurrentMinute]);

  if (aeropuertos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full rounded-lg bg-transparent">
        <span className="text-4xl mb-3 opacity-60">🗺️</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {resultadoALNS && (
        <div className="absolute left-4 top-4 z-[500] flex overflow-hidden rounded-lg border border-slate-700/60 bg-[#0c1a30]/95 shadow-xl">
          {([
            ['sa', 'SA'],
            ['alns', 'ALNS'],
            ['ambos', 'Ambos'],
          ] as const).map(([modo, label]) => (
            <button
              key={modo}
              onClick={() => onModoMapa(modo)}
              className={`px-3 py-2 text-xs font-semibold transition-colors
                ${modoMapa === modo ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-slate-700/70'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <MapContainer
        center={[20, 30]}
        zoom={3}
        minZoom={2}
        maxBounds={[[-90, -200], [90, 200]]}
        maxBoundsViscosity={1.0}
        style={{ width: '100%', height: '100%', backgroundColor: '#aadaff' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
          maxZoom={19}
          noWrap={true}
        />

        {/* Polilínea solo para el vuelo seleccionado */}
        {selectedVuelo && (
          <Polyline
            positions={[[selectedVuelo.origenLat, selectedVuelo.origenLon], [selectedVuelo.destinoLat, selectedVuelo.destinoLon]]}
            color="#60a5fa"
            weight={3}
            opacity={0.85}
            dashArray="8, 5"
          />
        )}

        {/* Marcadores de aeropuertos */}
        {aeropuertos.map(a => {
          const cargaActual = airportLoads.get(a.codigo) || 0;
          const pct = a.capacidadMax > 0 ? Math.round((cargaActual / a.capacidadMax) * 100) : 0;
          return (
            <CircleMarker
              key={a.codigo}
              center={[a.latitud, a.longitud]}
              radius={5}
              pathOptions={{
                fillColor: getAirportColor(cargaActual, a.capacidadMax, umbralVerde, umbralAmbar),
                fillOpacity: 0.9,
                color: "#fff",
                weight: 1,
                opacity: 0.8
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} className="airport-tooltip">
                <div style={{ fontSize: '11px', lineHeight: 1.4 }}>
                  <strong>{a.codigo}</strong> — {a.ciudad}<br/>
                  {a.pais} | GMT{a.gmt >= 0 ? '+' : ''}{a.gmt}<br/>
                  Carga: {cargaActual}/{a.capacidadMax} ({pct}%)
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Aviones SA en vuelo */}
        {mostrarSA && activePlanesSA.map((t) => {
          const { lat, lon, angle } = getInterpolatedPosition(t, absoluteCurrentMinute);
          const carga = flightLoadsSA.get(t.vueloId) || 0;
          const cColor = getPlaneColor(carga, t.capacidad, umbralVerde, umbralAmbar);
          return (
            <Marker 
              key={`plane-sa-${t.vueloId}`} 
              position={[lat, lon]} 
              icon={crearIconoAvion(cColor, angle)}
              eventHandlers={{ click: () => onSelectVuelo(t) }}
            />
          );
        })}

        {/* Aviones ALNS en vuelo */}
        {mostrarALNS && activePlanesALNS.map((t) => {
          const { lat, lon, angle } = getInterpolatedPosition(t, absoluteCurrentMinute);
          const carga = flightLoadsALNS.get(t.vueloId) || 0;
          const cColor = getPlaneColor(carga, t.capacidad, umbralVerde, umbralAmbar);
          return (
            <Marker 
              key={`plane-alns-${t.vueloId}`} 
              position={[lat, lon]} 
              icon={crearIconoAvion(cColor, angle)}
              eventHandlers={{ click: () => onSelectVuelo(t) }}
            />
          );
        })}

        <AjustadorMapa aeropuertos={aeropuertos} />
      </MapContainer>
    </div>
  );
}

// ========================== UTILS ========================== 

function deduplicarTramosLineas(tramos: any[]) {
  const seen = new Set<string>();
  return tramos.filter(t => {
    const key = `${t.origen}-${t.destino}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFlying(t: any, absoluteCurrent: number) {
  if (t.llegadaAbsMinutos === undefined || t.salidaAbsMinutos === undefined) return false;
  return absoluteCurrent >= t.salidaAbsMinutos && absoluteCurrent <= t.llegadaAbsMinutos;
}

function getInterpolatedPosition(t: any, absoluteCurrent: number) {
  let duration = t.llegadaAbsMinutos - t.salidaAbsMinutos;
  if (duration <= 0) duration = 1;
  
  let passed = absoluteCurrent - t.salidaAbsMinutos;
  let p = passed / duration;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  
  const lat = t.origenLat + (t.destinoLat - t.origenLat) * p;
  const lon = t.origenLon + (t.destinoLon - t.origenLon) * p;
  
  // y = lat, x = lon -> atan2(dx, dy) to get angle clockwise from North (because y goes down in screen coords, but in maps lat goes UP)
  // Wait: in maps, Lat increases UP. Lon increases RIGHT.
  const dLat = t.destinoLat - t.origenLat;
  const dLon = t.destinoLon - t.origenLon;
  const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
  
  return { lat, lon, angle };
}

function getActiveFlights(tramos: any[], absoluteCurrent: number) {
  const seen = new Set<number>();
  const active: any[] = [];
  
  for (const t of tramos) {
    if (!t.vueloId || seen.has(t.vueloId)) continue;
    if (isFlying(t, absoluteCurrent)) {
      seen.add(t.vueloId);
      active.push(t);
    }
  }
  return active;
}

function computeAllAirportLoads(rutas: any[], absoluteCurrentMinute: number): Map<string, number> {
  const loads = new Map<string, number>();
  for (const r of rutas) {
    if (!r.tramos || r.tramos.length === 0) continue;
    const first = r.tramos[0];
    const last = r.tramos[r.tramos.length - 1];
    
    // 1. Origen: Desde la recepción de las maletas en el aeropuerto hasta que sale el primer vuelo
    if (absoluteCurrentMinute >= r.recepcionAbsMinutos && absoluteCurrentMinute <= first.salidaAbsMinutos) {
       loads.set(r.origen, (loads.get(r.origen) || 0) + r.maletas);
    }
    
    // 2. Destino final: NO se acumula capacidad (las maletas se entregan)
    
    // 3. Conexiones intermedias: Desde que llega un vuelo hasta que sale el siguiente
    for (let i = 0; i < r.tramos.length - 1; i++) {
        const arr = r.tramos[i];
        const dep = r.tramos[i+1];
        if (absoluteCurrentMinute >= arr.llegadaAbsMinutos && absoluteCurrentMinute <= dep.salidaAbsMinutos) {
            loads.set(arr.destino, (loads.get(arr.destino) || 0) + r.maletas);
        }
    }
  }
  return loads;
}
