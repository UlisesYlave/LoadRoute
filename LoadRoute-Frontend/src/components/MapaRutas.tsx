'use client';

import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  Tooltip,
  ZoomControl,
} from 'react-leaflet';
import L from 'leaflet';
import { RutaResponse, AeropuertoDTO } from '@/types/rutas';
import { calcularCargaAeropuertoActual } from '@/utils/capacidad';
import 'leaflet/dist/leaflet.css';

type ModoMapa = 'sa' | 'alns' | 'ambos';

interface MapaRutasProps {
  resultado: RutaResponse | null;
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
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path fill="${color}" stroke="white" stroke-width="1.25" stroke-linejoin="round"
        d="M30 16c0 .85-.62 1.56-1.46 1.7l-9.36 1.47-4.86 9.1c-.34.64-1.2.75-1.7.22l-2.17-2.28 2.73-6.08-5.78.84-2.9 2.95c-.36.36-.9.45-1.36.22l-1.1-.55 2.18-5.43v-4.32L2.04 8.41l1.1-.55c.46-.23 1-.14 1.36.22l2.9 2.95 5.78.84-2.73-6.08 2.17-2.28c.5-.53 1.36-.42 1.7.22l4.86 9.1 9.36 1.47c.84.14 1.46.85 1.46 1.7z"/>
    </svg>
  `);

  return L.divIcon({
    className: 'loadroute-plane-marker',
    html: `<div style="width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55));transform:rotate(${angle}deg);transform-origin:center;will-change:transform;background:url('data:image/svg+xml,${svg}') center/contain no-repeat;"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function crearIconoAeropuerto(color: string): L.DivIcon {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76">
      <path fill="${color}" stroke="white" stroke-width="2.2"
        d="M32 2C18.2 2 7 13.1 7 26.9 7 44.3 32 74 32 74s25-29.7 25-47.1C57 13.1 45.8 2 32 2z"/>
      <g transform="translate(32 29) rotate(-38) scale(.92) translate(-16 -16)">
        <path fill="white"
          d="M30 16c0 .85-.62 1.56-1.46 1.7l-9.36 1.47-4.86 9.1c-.34.64-1.2.75-1.7.22l-2.17-2.28 2.73-6.08-5.78.84-2.9 2.95c-.36.36-.9.45-1.36.22l-1.1-.55 2.18-5.43v-4.32L2.04 8.41l1.1-.55c.46-.23 1-.14 1.36.22l2.9 2.95 5.78.84-2.73-6.08 2.17-2.28c.5-.53 1.36-.42 1.7.22l4.86 9.1 9.36 1.47c.84.14 1.46.85 1.46 1.7z"/>
      </g>
    </svg>
  `);

  return L.divIcon({
    className: 'loadroute-airport-marker',
    html: `<div style="width:34px;height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));background:url('data:image/svg+xml,${svg}') center/contain no-repeat;"></div>`,
    iconSize: [34, 40],
    iconAnchor: [17, 39],
  });
}

const PlaneMarker: React.FC<{
  tramo: any;
  rutasMuestra: any[];
  simTiempoMinutos: number;
  umbralVerde: number;
  umbralAmbar: number;
  prefix: string;
  onSelectVuelo: (vuelo: any) => void;
}> = React.memo(function PlaneMarker({
  tramo,
  rutasMuestra,
  simTiempoMinutos,
  umbralVerde,
  umbralAmbar,
  prefix,
  onSelectVuelo,
}) {
  const { lat, lon, angle } = getInterpolatedPosition(tramo, simTiempoMinutos);
  const carga = useMemo(() => getVueloLoad(tramo.vueloId, rutasMuestra), [tramo.vueloId, rutasMuestra]);
  const color = getPlaneColor(carga, tramo.capacidad, umbralVerde, umbralAmbar);
  const icon = useMemo(() => crearIconoAvion(color, angle), [color, angle]);
  const eventHandlers = useMemo(() => ({ click: () => onSelectVuelo(tramo) }), [onSelectVuelo, tramo]);

  return (
    <Marker
      key={`plane-${prefix}-${tramo.vueloId}`}
      position={[lat, lon]}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
});

export default function MapaRutas({
  resultado,
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

  const rutasMuestraSA = useMemo(() => resultadoSA?.rutasMuestra || [], [resultadoSA?.rutasMuestra]);
  const rutasMuestraALNS = useMemo(() => resultadoALNS?.rutasMuestra || [], [resultadoALNS?.rutasMuestra]);
  const tramosSA = useMemo(() => rutasMuestraSA.flatMap(r => r.tramos), [rutasMuestraSA]);
  const tramosALNS = useMemo(() => rutasMuestraALNS.flatMap(r => r.tramos), [rutasMuestraALNS]);

  const uniqueTramosLineasSA = deduplicarTramosLineas(tramosSA);
  const uniqueTramosLineasALNS = deduplicarTramosLineas(tramosALNS);

  const activePlanesSA = getActiveFlights(tramosSA, simTiempoMinutos);
  const activePlanesALNS = getActiveFlights(tramosALNS, simTiempoMinutos);

  if (aeropuertos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full rounded-lg bg-transparent">
        <span className="text-4xl mb-3 opacity-60">🗺️</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Toggle SA/ALNS — z-[600] para quedar sobre paneles flotantes */}
      <div className="absolute left-4 top-4 z-[600] flex overflow-hidden rounded-lg border border-slate-700/60 bg-[#0c1a30]/95 shadow-xl">
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
      <MapContainer
        center={[20, 30]}
        zoom={3}
        minZoom={2}
        maxZoom={12}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        style={{ width: '100%', height: '100%', backgroundColor: '#aadaff' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
          maxZoom={12}
          minZoom={2}
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
          const rutasParaCarga = modoMapa === 'sa'
            ? (resultadoSA?.rutasMuestra || [])
            : modoMapa === 'alns'
              ? (resultadoALNS?.rutasMuestra || resultadoSA?.rutasMuestra || [])
              : [...(resultadoSA?.rutasMuestra || []), ...(resultadoALNS?.rutasMuestra || [])];
              const cargaActual = calcularCargaAeropuertoActual(a.codigo, rutasParaCarga, simTiempoMinutos);
          const pct = a.capacidadMax > 0 ? Math.round((cargaActual / a.capacidadMax) * 100) : 0;
          const colorAeropuerto = getAirportColor(cargaActual, a.capacidadMax, umbralVerde, umbralAmbar);
          return (
            <Marker
              key={a.codigo}
              position={[a.latitud, a.longitud]}
              icon={crearIconoAeropuerto(colorAeropuerto)}
            >
              <Tooltip direction="top" offset={[0, -8]} className="airport-tooltip">
                <div style={{ fontSize: '11px', lineHeight: 1.4 }}>
                  <strong>{a.codigo}</strong> — {a.ciudad}<br/>
                  {a.pais} | GMT{a.gmt >= 0 ? '+' : ''}{a.gmt}<br/>
                  Carga: {cargaActual}/{a.capacidadMax} ({pct}%)
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Aviones SA en vuelo */}
        {mostrarSA && activePlanesSA.map((t) => (
          <PlaneMarker
            key={`plane-sa-${t.vueloId}`}
            tramo={t}
            rutasMuestra={rutasMuestraSA}
            simTiempoMinutos={simTiempoMinutos}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            prefix="sa"
            onSelectVuelo={onSelectVuelo}
          />
        ))}

        {/* Aviones ALNS en vuelo */}
        {mostrarALNS && activePlanesALNS.map((t) => (
          <PlaneMarker
            key={`plane-alns-${t.vueloId}`}
            tramo={t}
            rutasMuestra={rutasMuestraALNS}
            simTiempoMinutos={simTiempoMinutos}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            prefix="alns"
            onSelectVuelo={onSelectVuelo}
          />
        ))}

        <AjustadorMapa aeropuertos={aeropuertos} />
      </MapContainer>
      <style jsx global>{`
        .loadroute-plane-marker {
          transition: transform 16ms linear;
          will-change: transform;
        }
      `}</style>
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

function isFlying(t: any, simTotalMinutos: number) {
  if (t.llegadaMinutosGMT === undefined || t.salidaMinutosGMT === undefined || t.diaOffset === undefined) return false;

  const salidaTotal = t.diaOffset * 1440 + t.salidaMinutosGMT;
  let llegadaTotal = t.diaOffset * 1440 + t.llegadaMinutosGMT;

  // Si la llegada es menor a la salida, cruza la medianoche (llega el día siguiente)
  if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
    llegadaTotal += 1440;
  }

  return simTotalMinutos >= salidaTotal && simTotalMinutos <= llegadaTotal;
}

function getInterpolatedPosition(t: any, simTotalMinutos: number) {
  const salidaTotal = t.diaOffset * 1440 + t.salidaMinutosGMT;
  let llegadaTotal = t.diaOffset * 1440 + t.llegadaMinutosGMT;

  if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
    llegadaTotal += 1440;
  }

  const duration = llegadaTotal - salidaTotal;
  const passed = simTotalMinutos - salidaTotal;
  
  let p = duration === 0 ? 1 : passed / duration;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  
  const lat = t.origenLat + (t.destinoLat - t.origenLat) * p;
  const lon = t.origenLon + (t.destinoLon - t.origenLon) * p;
  
  const dLat = t.destinoLat - t.origenLat;
  const dLon = t.destinoLon - t.origenLon;
  const midLatRad = ((t.origenLat + t.destinoLat) / 2) * (Math.PI / 180);
  const dx = dLon * Math.cos(midLatRad);
  const dy = -dLat;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx) * (180 / Math.PI);
  
  return { lat, lon, angle };
}

function getActiveFlights(tramos: any[], current: number) {
  const seen = new Set<number>();
  const active: any[] = [];
  
  for (const t of tramos) {
    if (!t.vueloId || seen.has(t.vueloId)) continue;
    if (isFlying(t, current)) {
      seen.add(t.vueloId);
      active.push(t);
    }
  }
  return active;
}

function getAirportCurrentLoad(airportCode: string, rutas: any[], simTotalMinutos: number): number {
   let total = 0;
   for (const r of rutas) {
      if (!r.tramos || r.tramos.length === 0) continue;
      
      const firstFlight = r.tramos[0];
      const lastFlight = r.tramos[r.tramos.length - 1];

      const firstSalidaTotal = firstFlight.diaOffset * 1440 + firstFlight.salidaMinutosGMT;
      let lastLlegadaTotal = lastFlight.diaOffset * 1440 + lastFlight.llegadaMinutosGMT;
      if (lastFlight.llegadaMinutosGMT < lastFlight.salidaMinutosGMT) {
         lastLlegadaTotal += 1440;
      }

      if (airportCode === r.origen) {
         if (simTotalMinutos <= firstSalidaTotal) {
            total += r.maletas;
         }
      }
      
      if (airportCode === r.destino) {
         if (simTotalMinutos >= lastLlegadaTotal) {
            total += r.maletas;
         }
      }

      for (let i = 0; i < r.tramos.length - 1; i++) {
         const arrFlight = r.tramos[i];
         const depFlight = r.tramos[i+1];

         let arrLlegadaTotal = arrFlight.diaOffset * 1440 + arrFlight.llegadaMinutosGMT;
         if (arrFlight.llegadaMinutosGMT < arrFlight.salidaMinutosGMT) {
            arrLlegadaTotal += 1440;
         }
         const depSalidaTotal = depFlight.diaOffset * 1440 + depFlight.salidaMinutosGMT;

         if (airportCode === arrFlight.destino) {
            if (simTotalMinutos >= arrLlegadaTotal && simTotalMinutos <= depSalidaTotal) {
                total += r.maletas;
            }
         }
      }
   }
   return total;
}

// Obtener maletas en un vuelo consultando las envolturas de rutas
function getVueloLoad(vueloId: number, rutasMuestra: any[]): number {
    return rutasMuestra
       .filter(r => r.tramos && r.tramos.some((tr: any) => tr.vueloId === vueloId))
       .reduce((sum, r) => sum + r.maletas, 0);
}
