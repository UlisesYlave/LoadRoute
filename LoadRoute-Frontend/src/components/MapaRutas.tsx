'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { RutaResponse, AeropuertoDTO, FiltrosAvionesMapa, RutaMuestra, TramoDTO } from '@/types/rutas';
import { TIEMPO_ESPERA_DESTINO } from '@/utils/capacidad';
import { IconMap } from '@/components/icons';
import 'leaflet/dist/leaflet.css';
import { EnfocarAvion } from './EnfocarAvion';
import { EnfocarAeropuerto } from './EnfocarAeropuerto';

type ModoMapa = 'sa';
type IndiceCargaAeropuerto = {
  inicios: number[];
  cargasInicio: number[];
  fines: number[];
  cargasFin: number[];
};
type IndicesCargaAeropuertos = Record<string, IndiceCargaAeropuerto>;

interface MapaRutasProps {
  resultado: RutaResponse | null;
  simTiempoMinutos: number;
  cargasAeropuertoOverride?: Record<string, number> | null;
  onSelectVuelo: (vuelo: any) => void;
  onSelectAeropuerto: (aeropuerto: AeropuertoDTO) => void;
  selectedVuelo?: any | null;  // tramo seleccionado — dibuja solo su polilínea
  vueloAEnfocar?: any | null;
  aeropuertoAEnfocar?: any | null;
  umbralVerde: number;
  umbralAmbar: number;
  modoMapa: ModoMapa;
  onModoMapa: (modo: ModoMapa) => void;
  filtrosAviones?: FiltrosAvionesMapa;
  cancelacionesPorDia?: number[][];
  filtroSemaforoVuelos?: 'todos' | 'verde' | 'ambar' | 'rojo';
  filtroSemaforoAero?: 'todos' | 'verde' | 'ambar' | 'rojo';
  selectedEnvio?: RutaMuestra | null;
}


// Color fijo para aeropuertos: azul del header en operación normal, rojo en colapso
const AIRPORT_BLUE = '#3b82f6';
const AIRPORT_COLLAPSE_RED = '#ef4444';
const DEFAULT_MAX_ZOOM = 12;
const MIN_MAX_ZOOM = 8;
const MAX_MAX_ZOOM = 15;

function getMaxZoomForPageWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return DEFAULT_MAX_ZOOM;
  const computedZoom = Math.round(Math.log2(width / 320) + 10);
  return Math.min(MAX_MAX_ZOOM, Math.max(MIN_MAX_ZOOM, computedZoom));
}

// ── CONSTANTES MATEMÁTICAS PARA CURVAS ──
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

function isAirportCollapsed(cargaActual: number, capacidadMax: number): boolean {
  if (capacidadMax <= 0) return false;
  // Colapso ocurre al 100% de la capacidad (aeropuerto completamente lleno)
  return cargaActual >= capacidadMax;
}

// Semáforo dinámico de Aviones
// Semáforo dinámico de Aviones
function getPlaneColor(cargaActual: number, capacidadMax: number, umbralVerde: number, umbralAmbar: number): string {
  if (cargaActual === 0) return '#6b7080'; // Gris para aviones vacíos (sin carga)
  
  const p = (cargaActual / Math.max(capacidadMax, 1)) * 100;
  if (p <= umbralVerde) return '#10b981';
  if (p <= umbralAmbar) return '#f59e0b';
  return '#ef4444';
}

// Componente para ajustar el mapa a los bounds
const AjustadorMapa: React.FC<{ aeropuertos: AeropuertoDTO[]; maxZoom: number }> = ({ aeropuertos, maxZoom }) => {
  const map = useMap();

  useEffect(() => {
    if (aeropuertos.length === 0) return;

    const bounds = L.latLngBounds(
      aeropuertos.map(a => [a.latitud, a.longitud] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(maxZoom, 5) });
  }, [aeropuertos, map, maxZoom]);

  return null;
};

// Caching system for Leaflet icons to drastically improve performance and avoid GC pressure
const planeIconCache: Record<string, L.DivIcon> = {};
const airportIconCache: Record<string, L.DivIcon> = {};

function getIconoAvion(color: string, angle: number, isFocused = false): L.DivIcon {
  if (isFocused) {
    return crearIconoAvion(color, angle, true);
  }
  const roundedAngle = Math.round(angle / 15) * 15;
  const key = `${color}-${roundedAngle}`;
  if (!planeIconCache[key]) {
    planeIconCache[key] = crearIconoAvion(color, roundedAngle, false);
  }
  return planeIconCache[key];
}

function getIconoAeropuerto(
  cargaActual: number,
  capacidadMax: number,
  umbralVerde: number,
  umbralAmbar: number,
  collapsed: boolean,
  isFocused = false
): L.DivIcon {
  if (isFocused) {
    return crearIconoAeropuerto(cargaActual, capacidadMax, umbralVerde, umbralAmbar, collapsed, true);
  }
  const p = capacidadMax > 0 ? Math.round((cargaActual / capacidadMax) * 100) : 0;
  const key = `${p}-${capacidadMax}-${umbralVerde}-${umbralAmbar}-${collapsed}`;
  if (!airportIconCache[key]) {
    airportIconCache[key] = crearIconoAeropuerto(cargaActual, capacidadMax, umbralVerde, umbralAmbar, collapsed, false);
  }
  return airportIconCache[key];
}

// Iconos de avión según semáforo
function crearIconoAvion(color: string, angle: number, isFocused = false): L.DivIcon {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"
        d="M 21.5,12 C 21.5,13.5 20,13.5 20,13.5 L 14,13.5 L 9,20 L 7,20 L 10,13.5 L 5,13.5 L 3,15.5 L 2,15.5 L 3,12 L 2,8.5 L 3,8.5 L 5,10.5 L 10,10.5 L 7,4 L 9,4 L 14,10.5 L 20,10.5 C 20,10.5 21.5,10.5 21.5,12 Z" />
    </svg>
  `);

  const focusClass = isFocused ? ' focused-marker-pulse' : '';

  return L.divIcon({
    className: `loadroute-plane-marker${focusClass}`,
    html: `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
        <div style="width: 20px; height: 20px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55)); transform: rotate(${angle}deg); transform-origin: center; will-change: transform; background: url('data:image/svg+xml,${svg}') center/contain no-repeat;"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function crearIconoAeropuerto(
  cargaActual: number,
  capacidadMax: number,
  umbralVerde: number,
  umbralAmbar: number,
  collapsed: boolean,
  isFocused = false
): L.DivIcon {
  let color = '#065f46';
  if (capacidadMax > 0) {
    const p = (cargaActual / capacidadMax) * 100;
    if (p <= umbralVerde) {
      color = '#065f46';
    } else if (p <= umbralAmbar) {
      color = '#b45309';
    } else {
      color = '#991b1b';
    }
  }
  if (collapsed) {
    color = '#991b1b';
  }
  
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="28" fill="${color}" stroke="white" stroke-width="4" />
      <path fill="white" d="M24 42V26l8-8 8 8v16H24zm4-12v4h8v-4h-8z"/>
    </svg>
  `);

  const collapsedClass = collapsed ? ' airport-collapse-pulse' : '';
  const focusClass = isFocused ? ' focused-marker-pulse' : '';
  const extraClass = collapsedClass || focusClass ? ` ${collapsedClass}${focusClass}`.trim() : '';

  return L.divIcon({
    className: `loadroute-airport-marker ${extraClass}`.trim(),
    html: `<div style="width:100%;height:100%;background:url('data:image/svg+xml,${svg}') center/contain no-repeat; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); z-index: 5000;"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

const AirportMarker: React.FC<{
  aeropuerto: AeropuertoDTO;
  cargaActual: number;
  umbralVerde: number;
  umbralAmbar: number;
  onSelectAeropuerto: (aeropuerto: AeropuertoDTO) => void;
  isFocused?: boolean;
}> = React.memo(function AirportMarker({
  aeropuerto,
  cargaActual,
  umbralVerde,
  umbralAmbar,
  onSelectAeropuerto,
  isFocused = false,
}) {
  const collapsed = isAirportCollapsed(cargaActual, aeropuerto.capacidadMax);
  const icon = getIconoAeropuerto(cargaActual, aeropuerto.capacidadMax, umbralVerde, umbralAmbar, collapsed, isFocused);
  const eventHandlers = useMemo(() => ({ click: () => onSelectAeropuerto(aeropuerto) }), [aeropuerto, onSelectAeropuerto]);

  // Fondo dinámico del badge de carga para el Aeropuerto
  let bgCarga = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (aeropuerto.capacidadMax > 0) {
    const p = (cargaActual / aeropuerto.capacidadMax) * 100;
    if (collapsed) bgCarga = 'bg-red-600 text-white font-bold border-red-700 shadow-sm';
    else if (p > umbralAmbar) bgCarga = 'bg-red-100 text-red-700 border-red-200';
    else if (p > umbralVerde) bgCarga = 'bg-amber-100 text-amber-700 border-amber-200';
  }

  return (
    <Marker position={[aeropuerto.latitud, aeropuerto.longitud]} icon={icon} eventHandlers={eventHandlers}>
      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="custom-modern-tooltip">
        <div className="flex flex-col min-w-[100px] font-sans">
          {/* Header con Código del Aeropuerto */}
          <div className="border-b flex items-center justify-between">
            <span className="font-black text-blue-900 text-[12px] tracking-wide">
              {aeropuerto.codigo}
            </span>
          </div>
          
          {/* Información Ciudad/País */}
          <div className="text-xs text-slate-600 mb-1 leading-relaxed flex flex-col">
            {aeropuerto.ciudad && <span className="font-semibold text-slate-700">{aeropuerto.ciudad}</span>}
            {aeropuerto.pais && <span className="text-slate-600">{aeropuerto.pais}</span>}
          </div>

          {/* Badge de Capacidad */}
          <div className={`flex justify-between items-center px-2 py-1.5 rounded-md border text-xs ${bgCarga}`}>
            <span className="font-semibold">CAP :</span>
            <span className="font-bold tracking-tight">{cargaActual} / {aeropuerto.capacidadMax}</span>
          </div>
        </div>
      </Tooltip>
    </Marker>
  );
});

const PlaneMarker: React.FC<{
  tramo: any;
  carga: number;
  simTiempoMinutos: number;
  umbralVerde: number;
  umbralAmbar: number;
  prefix: string;
  onSelectVuelo: (vuelo: any) => void;
  isFocused?: boolean;
}> = React.memo(function PlaneMarker({
  tramo,
  carga,
  simTiempoMinutos,
  umbralVerde,
  umbralAmbar,
  prefix,
  onSelectVuelo,
  isFocused = false,
}) {
  const { lat, lon, angle } = getInterpolatedPosition(tramo, simTiempoMinutos);
  const colorHex = getPlaneColor(carga, tramo.capacidad, umbralVerde, umbralAmbar);
  const icon = getIconoAvion(colorHex, angle, isFocused);
  const eventHandlers = useMemo(() => ({ click: () => onSelectVuelo(tramo) }), [onSelectVuelo, tramo]);

  // Fondo dinámico para el badge de carga
  let cargaClass = 'bg-gray-100 text-gray-700 border-gray-200';
  if (carga > 0) {
    const p = (carga / Math.max(tramo.capacidad, 1)) * 100;
    if (p <= umbralVerde) cargaClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    else if (p <= umbralAmbar) cargaClass = 'bg-amber-100 text-amber-700 border-amber-200';
    else cargaClass = 'bg-red-100 text-red-700 border-red-200';
  }

  return (
    <Marker key={`plane-${prefix}-${tramo.vueloId}`} position={[lat, lon]} icon={icon} eventHandlers={eventHandlers}>
      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="custom-modern-tooltip">
        <div className="flex flex-col min-w-[100px] font-sans">
          {/* Header */}
          <div className="border-b flex items-center justify-between">
            <span className="font-extrabold text-slate-700 text-sm tracking-wide">
              Vuelo #{tramo.vueloId}
            </span>
          </div>
          
          {/* Ruta original con códigos */}
          <div className="flex flex-col gap-1 text-xs text-slate-600 mb-1">
            <div className="flex items-center justify-between p-1 rounded border border-slate-100">
              <span className="font-semibold text-slate-700 text-[13px]">{tramo.origen}</span>
              <span className="text-slate-600 font-bold text-[10px]">➔</span>
              <span className="font-semibold text-slate-700 text-[13px]">{tramo.destino}</span>
            </div>
          </div>

          {/* Badge de estado de carga */}
          <div className={`flex justify-between items-center px-2 py-1.5 rounded-md border text-xs ${cargaClass}`}>
            <span className="font-semibold">CAP :</span>
            <span className="font-bold">{carga} / {tramo.capacidad || 'N/A'}</span>
          </div>
        </div>
      </Tooltip>
    </Marker>
  );
});

export default function MapaRutas({
  resultado,
  simTiempoMinutos,
  cargasAeropuertoOverride,
  onSelectVuelo,
  onSelectAeropuerto,
  selectedVuelo,
  vueloAEnfocar,
  aeropuertoAEnfocar,
  umbralVerde,
  umbralAmbar,
  modoMapa,
  filtrosAviones,
  cancelacionesPorDia,
  filtroSemaforoVuelos = 'todos',
  filtroSemaforoAero = 'todos',
  selectedEnvio,
}: MapaRutasProps) {
  const aeropuertos = resultado?.aeropuertos || [];
  const resultadoSA = resultado?.resultadoSA;
  const mostrarSA = true;
  const [mapMaxZoom, setMapMaxZoom] = useState(DEFAULT_MAX_ZOOM);
  const [mapMinZoom, setMapMinZoom] = useState<number | null>(null); // Estado dinámico para el zoom mínimo

  const rutasMuestraSA = useMemo(() => resultadoSA?.rutasMuestra || [], [resultadoSA?.rutasMuestra]);
  const tramosSA = useMemo(() => rutasMuestraSA.flatMap(r => r.tramos), [rutasMuestraSA]);
  const tramosVisiblesSA = useMemo(
    () => filtrarAvionesPorAeropuerto(tramosSA, filtrosAviones),
    [tramosSA, filtrosAviones]
  );
  const cargaPorVueloSA = useMemo(() => calcularCargaPorVuelo(rutasMuestraSA), [rutasMuestraSA]);
  const rutasParaCarga = useMemo(() => {
    if (modoMapa === 'sa') return resultadoSA?.rutasMuestra || [];
    return [
      ...(resultadoSA?.rutasMuestra || []),
    ];
  }, [modoMapa, resultadoSA?.rutasMuestra]);
  const indiceCargasAeropuertos = useMemo(
    () => construirIndiceCargasAeropuertos(rutasParaCarga),
    [rutasParaCarga]
  );
  const cargasAeropuertos = useMemo(
    () => cargasAeropuertoOverride
      ?? calcularCargasAeropuertosEnMinuto(indiceCargasAeropuertos, simTiempoMinutos),
    [cargasAeropuertoOverride, indiceCargasAeropuertos, simTiempoMinutos]
  );

  const activePlanesSA = useMemo(
    () => mostrarSA ? getActiveFlights(tramosVisiblesSA, simTiempoMinutos) : [],
    [mostrarSA, tramosVisiblesSA, simTiempoMinutos]
  );

  const simDia = Math.floor(simTiempoMinutos / 1440);
  const vuelosCanceladosHoy = useMemo(() => {
    const listCancelaciones = cancelacionesPorDia || resultado?.cancelacionesPorDiaSA;
    if (!listCancelaciones || !resultado?.vuelosMaestros) return [];
    const ids = listCancelaciones[simDia] || [];
    const vuelos = ids.map(id => resultado.vuelosMaestros?.find(v => v.vueloId === id)).filter(Boolean);
    return vuelos;
  }, [cancelacionesPorDia, resultado?.cancelacionesPorDiaSA, resultado?.vuelosMaestros, simDia]);

  const activeMasterPlanesToday = useMemo(() => {
    if (!resultado?.vuelosMaestros) return [];
    const active: TramoDTO[] = [];
    for (const v of resultado.vuelosMaestros) {
      const tToday = { ...v, diaOffset: simDia };
      if (isFlying(tToday, simTiempoMinutos)) {
        active.push(tToday);
        continue;
      }
      if (simDia > 0) {
        const tYesterday = { ...v, diaOffset: simDia - 1 };
        if (isFlying(tYesterday, simTiempoMinutos)) {
          active.push(tYesterday);
        }
      }
    }
    return active;
  }, [resultado?.vuelosMaestros, simDia, simTiempoMinutos]);

  const activePlanesSAKeys = useMemo(() => {
    return new Set(activePlanesSA.map(p => `${p.vueloId}-${p.diaOffset}`));
  }, [activePlanesSA]);

  const emptyPlanesSA = useMemo(() => {
    if (!mostrarSA || filtrosAviones?.ocultarVacios) return [];
    return activeMasterPlanesToday.filter(v => {
      if (activePlanesSAKeys.has(`${v.vueloId}-${v.diaOffset}`)) return false;
      const listCancelaciones = cancelacionesPorDia || resultado?.cancelacionesPorDiaSA;
      const ids = listCancelaciones?.[v.diaOffset];
      if (ids && ids.includes(v.vueloId)) return false;
      return true;
    });
  }, [mostrarSA, activeMasterPlanesToday, activePlanesSAKeys, cancelacionesPorDia, resultado?.cancelacionesPorDiaSA, filtrosAviones?.ocultarVacios]);

  const emptyPlanesSAFiltered = useMemo(() => {
    return filtrarAvionesPorAeropuerto(emptyPlanesSA, filtrosAviones);
  }, [emptyPlanesSA, filtrosAviones]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateZooms = () => {
      const width = window.innerWidth || document.documentElement.clientWidth || window.screen.width;
      const height = window.innerHeight || document.documentElement.clientHeight || window.screen.height;
      
      // Actualizar Max Zoom (acercarse)
      const nextMaxZoom = getMaxZoomForPageWidth(width);
      setMapMaxZoom(prev => (prev === nextMaxZoom ? prev : nextMaxZoom));

      // Actualizar Min Zoom (alejarse) - MODO COVER (sin franjas)
      // 256 es el tamaño en pixeles de 1 tile completo del mundo en zoom 0
      const zoomX = Math.log2(width / 256);
      const zoomY = Math.log2(height / 256);
      
      // Tomamos el valor mayor. Esto asegura que la pantalla entera siempre esté cubierta.
      const computedMinZoom = Math.max(zoomX, zoomY);
      setMapMinZoom(Math.max(1, computedMinZoom));
    };

    updateZooms();
    window.addEventListener('resize', updateZooms);

    return () => window.removeEventListener('resize', updateZooms);
  }, []);

  if (aeropuertos.length === 0 || mapMinZoom === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full rounded-lg bg-transparent">
        <IconMap className="mb-3 text-cyan-400/40" size={40} />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden">

      <MapContainer
        center={[20, 30]}
        zoom={3}
        minZoom={mapMinZoom}
        maxZoom={mapMaxZoom}
        // Bloqueamos el movimiento horizontal (longitud -180 a 180) para que no se repita el mundo,
        // pero dejamos las latitudes (verticales) en Infinity para permitir el modo "Cover".
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        zoomSnap={0.5}
        worldCopyJump={false}
        style={{ width: '100%', height: '100%', backgroundColor: '#aadaff' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
          maxZoom={mapMaxZoom}
          minZoom={mapMinZoom}
          noWrap={true} // Obligatorio para evitar que Leaflet intente renderizar mapas vecinos lateralmente
        />

        {selectedVuelo && (
          <Polyline
            positions={getCurvaOrtodromicaCached(selectedVuelo.origenLat, selectedVuelo.origenLon, selectedVuelo.destinoLat, selectedVuelo.destinoLon)}
            color="#60a5fa"
            weight={3}
            opacity={0.85}
            dashArray="8, 5"
          />
        )}

        {selectedEnvio && selectedEnvio.tramos && selectedEnvio.tramos.map((tramo, index) => {
          // Validar existencia de coordenadas válidas para evitar caídas en Leaflet
          const hasCoords = tramo &&
                            typeof tramo.origenLat === 'number' && !isNaN(tramo.origenLat) &&
                            typeof tramo.origenLon === 'number' && !isNaN(tramo.origenLon) &&
                            typeof tramo.destinoLat === 'number' && !isNaN(tramo.destinoLat) &&
                            typeof tramo.destinoLon === 'number' && !isNaN(tramo.destinoLon);
          if (!hasCoords) return null;

          const simTimeVal = typeof simTiempoMinutos === 'number' && !isNaN(simTiempoMinutos) ? simTiempoMinutos : 0;
          const salidaTotal = (tramo.diaOffset ?? 0) * 1440 + tramo.salidaMinutosGMT;
          let llegadaTotal = (tramo.diaOffset ?? 0) * 1440 + tramo.llegadaMinutosGMT;
          if (tramo.llegadaMinutosGMT < tramo.salidaMinutosGMT) {
            llegadaTotal += 1440;
          }

          const hasPassed = simTimeVal >= llegadaTotal;
          const isPending = simTimeVal < salidaTotal;

          const keyPrefix = `envio-route-${selectedEnvio.envioId}-${tramo.vueloId}-${index}`;

          if (hasPassed) {
            // Completado: Verde esmeralda continuo
            const positions = getCurvaOrtodromicaCached(tramo.origenLat, tramo.origenLon, tramo.destinoLat, tramo.destinoLon);
            return (
              <Polyline
                key={`${keyPrefix}-passed`}
                positions={positions}
                color="#10b981"
                weight={5}
                opacity={0.9}
              >
                <Tooltip direction="top">
                  <div className="font-sans text-xs p-1">
                    <span className="font-bold text-emerald-500">✓ Completado</span><br />
                    Vuelo #{tramo.vueloId}: {tramo.origen} → {tramo.destino}
                  </div>
                </Tooltip>
              </Polyline>
            );
          } else if (isPending) {
            // Pendiente: Gris pizarra punteado
            const positions = getCurvaOrtodromicaCached(tramo.origenLat, tramo.origenLon, tramo.destinoLat, tramo.destinoLon);
            return (
              <Polyline
                key={`${keyPrefix}-pending`}
                positions={positions}
                color="#94a3b8"
                weight={4}
                opacity={0.7}
                dashArray="8, 6"
              >
                <Tooltip direction="top">
                  <div className="font-sans text-xs p-1">
                    <span className="font-bold text-slate-400">⌚ Pendiente (Escala/Futuro)</span><br />
                    Vuelo #{tramo.vueloId}: {tramo.origen} → {tramo.destino}
                  </div>
                </Tooltip>
              </Polyline>
            );
          } else {
            // En pleno vuelo: Dividido en verde y gris en base a posición actual
            const { lat, lon } = getInterpolatedPosition(tramo, simTimeVal);
            
            // Generar curvas para las dos mitades
            const completedPositions = generarCurvaOrtodromica(tramo.origenLat, tramo.origenLon, lat, lon, 25);
            const pendingPositions = generarCurvaOrtodromica(lat, lon, tramo.destinoLat, tramo.destinoLon, 25);

            // Devolver un array de Polylines para evitar el uso de React.Fragment que puede dar problemas con Leaflet
            return [
              <Polyline
                key={`${keyPrefix}-current-passed`}
                positions={completedPositions}
                color="#10b981"
                weight={5}
                opacity={0.9}
              >
                <Tooltip direction="top">
                  <div className="font-sans text-xs p-1">
                    <span className="font-bold text-cyan-400">✈ En Pleno Vuelo (Ya recorrido)</span><br />
                    Vuelo #{tramo.vueloId}: {tramo.origen} → {tramo.destino}
                  </div>
                </Tooltip>
              </Polyline>,
              <Polyline
                key={`${keyPrefix}-current-pending`}
                positions={pendingPositions}
                color="#94a3b8"
                weight={4}
                opacity={0.7}
                dashArray="8, 6"
              >
                <Tooltip direction="top">
                  <div className="font-sans text-xs p-1">
                    <span className="font-bold text-cyan-400">✈ En Pleno Vuelo (Por recorrer)</span><br />
                    Vuelo #{tramo.vueloId}: {tramo.origen} → {tramo.destino}
                  </div>
                </Tooltip>
              </Polyline>
            ];
          }
        })}


        {vuelosCanceladosHoy.map(vuelo => {
          if (!vuelo) return null;
          const origen = aeropuertos.find(a => a.codigo === vuelo.origen);
          const destino = aeropuertos.find(a => a.codigo === vuelo.destino);
          if (!origen || !destino) return null;
          return (
            <Polyline
              key={`canceled-${vuelo.vueloId}`}
              positions={getCurvaOrtodromicaCached(origen.latitud, origen.longitud, destino.latitud, destino.longitud)}
              color="#ef4444"
              weight={2}
              opacity={0.7}
              dashArray="8, 5"
            >
              <Tooltip direction="top" className="canceled-tooltip">
                <span className="font-bold text-red-500">🚫 Vuelo Cancelado</span><br />
                {vuelo.origen} → {vuelo.destino}
              </Tooltip>
            </Polyline>
          );
        })}

        {aeropuertos.filter(a => {
          if (filtroSemaforoAero === 'todos') return true;
          const carga = cargasAeropuertos[a.codigo] || 0;
          const pct = a.capacidadMax > 0 ? (carga / a.capacidadMax) * 100 : 0;
          const esVerde = pct <= umbralVerde;
          const esAmbar = !esVerde && pct <= umbralAmbar;
          const esRojo = !esVerde && !esAmbar;
          if (filtroSemaforoAero === 'verde') return esVerde;
          if (filtroSemaforoAero === 'ambar') return esAmbar;
          if (filtroSemaforoAero === 'rojo') return esRojo;
          return true;
        }).map(a => (
          <AirportMarker
            key={a.codigo}
            aeropuerto={a}
            cargaActual={cargasAeropuertos[a.codigo] || 0}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            onSelectAeropuerto={onSelectAeropuerto}
            isFocused={!!(aeropuertoAEnfocar && aeropuertoAEnfocar.codigo === a.codigo)}
          />
        ))}

        {mostrarSA && activePlanesSA.filter(t => {
          if (filtroSemaforoVuelos === 'todos') return true;
          const carga = cargaPorVueloSA[`${t.vueloId}-${t.diaOffset}`] || 0;
          const pct = (carga / Math.max(t.capacidad, 1)) * 100;
          const esVerde = pct <= umbralVerde;
          const esAmbar = !esVerde && pct <= umbralAmbar;
          const esRojo = !esVerde && !esAmbar;
          if (filtroSemaforoVuelos === 'verde') return esVerde;
          if (filtroSemaforoVuelos === 'ambar') return esAmbar;
          if (filtroSemaforoVuelos === 'rojo') return esRojo;
          return true;
        }).map((t) => (
          <PlaneMarker
            key={`plane-sa-${t.vueloId}-${t.diaOffset}`}
            tramo={t}
            carga={cargaPorVueloSA[`${t.vueloId}-${t.diaOffset}`] || 0}
            simTiempoMinutos={simTiempoMinutos}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            prefix="sa"
            onSelectVuelo={onSelectVuelo}
            isFocused={!!(vueloAEnfocar && String(vueloAEnfocar.vueloId) === String(t.vueloId) && vueloAEnfocar.diaOffset === t.diaOffset)}
          />
        ))}

        {mostrarSA && emptyPlanesSAFiltered.filter(t => {
          if (filtroSemaforoVuelos === 'todos') return true;
          return filtroSemaforoVuelos === 'verde';
        }).map((t) => (
          <PlaneMarker
            key={`plane-sa-empty-${t.vueloId}-${t.diaOffset}`}
            tramo={t}
            carga={0}
            simTiempoMinutos={simTiempoMinutos}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            prefix="sa-empty"
            onSelectVuelo={onSelectVuelo}
            isFocused={!!(vueloAEnfocar && String(vueloAEnfocar.vueloId) === String(t.vueloId) && vueloAEnfocar.diaOffset === t.diaOffset)}
          />
        ))}

        <AjustadorMapa aeropuertos={aeropuertos} maxZoom={mapMaxZoom} />

        <EnfocarAvion 
          selectedVuelo={vueloAEnfocar}
          simTiempoMinutos={simTiempoMinutos} 
          getInterpolatedPosition={getInterpolatedPosition} 
        />

        <EnfocarAeropuerto 
          aeropuertoAEnfocar={aeropuertoAEnfocar} 
        />
      </MapContainer>
      <style jsx global>{`
        .loadroute-plane-marker {
          transition: transform 16ms linear;
          will-change: transform;
        }

        @keyframes airportCollapsePulse {
          0%, 100% {
            filter: drop-shadow(0 0 0px rgba(239, 68, 68, 0));
          }
          50% {
            filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.95))
                  drop-shadow(0 0 20px rgba(239, 68, 68, 0.6));
          }
        }
        .airport-collapse-pulse {
          animation: airportCollapsePulse 0.9s ease-in-out infinite;
        }

        .loadroute-airport-marker {
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
          z-index: 5000 !important;
        }

        @keyframes markerFocusPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.9);
          }
          70% {
            box-shadow: 0 0 0 18px rgba(6, 182, 212, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(6, 182, 212, 0);
          }
        }
        .focused-marker-pulse {
          box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.9);
          animation: markerFocusPulse 1.4s cubic-bezier(0.24, 0, 0.38, 1) infinite;
          border-radius: 9999px;
          overflow: visible !important;
          z-index: 9999 !important;
        }
      `}</style>
    </div>
  );
}

// ========================== UTILS & MATH ========================== 

function getGreatCirclePoint(lat1: number, lon1: number, lat2: number, lon2: number, fraction: number) {
  const rLat1 = lat1 * TO_RAD;
  const rLon1 = lon1 * TO_RAD;
  const rLat2 = lat2 * TO_RAD;
  const rLon2 = lon2 * TO_RAD;

  const dLon = rLon2 - rLon1;
  const dLat = rLat2 - rLat1;

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const d = 2 * Math.asin(Math.sqrt(a));

  if (d === 0) return { lat: lat1, lon: lon1, angle: 0 };

  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);

  const x = A * Math.cos(rLat1) * Math.cos(rLon1) + B * Math.cos(rLat2) * Math.cos(rLon2);
  const y = A * Math.cos(rLat1) * Math.sin(rLon1) + B * Math.cos(rLat2) * Math.sin(rLon2);
  const z = A * Math.sin(rLat1) + B * Math.sin(rLat2);

  const lat3 = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon3 = Math.atan2(y, x);

  const yAngle = Math.sin(rLon2 - lon3) * Math.cos(rLat2);
  const xAngle = Math.cos(lat3) * Math.sin(rLat2) - Math.sin(lat3) * Math.cos(rLat2) * Math.cos(rLon2 - lon3);
  const trueBearing = Math.atan2(yAngle, xAngle) * TO_DEG;
  
  const adjustedAngle = trueBearing - 90;

  return { 
    lat: lat3 * TO_DEG, 
    lon: lon3 * TO_DEG, 
    angle: adjustedAngle 
  };
}

const curveCache: Record<string, [number, number][]> = {};

function getCurvaOrtodromicaCached(lat1: number, lon1: number, lat2: number, lon2: number): [number, number][] {
  const key = `${lat1.toFixed(4)},${lon1.toFixed(4)}->${lat2.toFixed(4)},${lon2.toFixed(4)}`;
  if (!curveCache[key]) {
    curveCache[key] = generarCurvaOrtodromica(lat1, lon1, lat2, lon2);
  }
  return curveCache[key];
}

function generarCurvaOrtodromica(lat1: number, lon1: number, lat2: number, lon2: number, numPuntos = 50): [number, number][] {
  const puntos: [number, number][] = [];
  for (let i = 0; i <= numPuntos; i++) {
    const fraction = i / numPuntos;
    const pt = getGreatCirclePoint(lat1, lon1, lat2, lon2, fraction);
    puntos.push([pt.lat, pt.lon]);
  }
  return puntos;
}

function filtrarAvionesPorAeropuerto(tramos: TramoDTO[], filtros?: FiltrosAvionesMapa) {
  if (!filtros || (!filtros.usarOrigen && !filtros.usarDestino)) return tramos;
  if (filtros.usarOrigen && filtros.origenes.length === 0) return [];
  if (filtros.usarDestino && filtros.destinos.length === 0) return [];

  const origenes = new Set(filtros.origenes);
  const destinos = new Set(filtros.destinos);

  return tramos.filter(t => {
    const coincideOrigen = !filtros.usarOrigen || origenes.has(t.origen);
    const coincideDestino = !filtros.usarDestino || destinos.has(t.destino);
    return coincideOrigen && coincideDestino;
  });
}

function salidaTotalMinutos(t: TramoDTO): number {
  return (t.diaOffset || 0) * 1440 + t.salidaMinutosGMT;
}

function llegadaTotalMinutos(t: TramoDTO): number {
  let llegada = (t.diaOffset || 0) * 1440 + t.llegadaMinutosGMT;
  if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
    llegada += 1440;
  }
  return llegada;
}

function agregarIntervaloCarga(
  intervalos: Record<string, { inicio: number; fin: number; maletas: number }[]>,
  airportCode: string,
  inicio: number,
  fin: number,
  maletas: number
) {
  if (fin < inicio) return;
  if (!intervalos[airportCode]) intervalos[airportCode] = [];
  intervalos[airportCode].push({ inicio, fin, maletas });
}

function construirIndiceCargasAeropuertos(rutas: RutaMuestra[]): IndicesCargaAeropuertos {
  const intervalos: Record<string, { inicio: number; fin: number; maletas: number }[]> = {};

  for (const ruta of rutas) {
    if (!ruta.tramos || ruta.tramos.length === 0) {
      const recepcionTotal = ((ruta.recepcionDiaOffset || 0) * 1440) + (ruta.recepcionMinutosGMT || 0);
      agregarIntervaloCarga(intervalos, ruta.origen, recepcionTotal, 9999999, ruta.maletas);
      continue;
    }

    const primerVuelo = ruta.tramos[0];
    const primeraSalida = salidaTotalMinutos(primerVuelo);
    const recepcionTotal = ((ruta.recepcionDiaOffset ?? primerVuelo.diaOffset) || 0) * 1440
      + (ruta.recepcionMinutosGMT ?? 0);

    agregarIntervaloCarga(intervalos, ruta.origen, recepcionTotal, primeraSalida, ruta.maletas);

    for (let i = 0; i < ruta.tramos.length - 1; i++) {
      const vueloLlegada = ruta.tramos[i];
      const vueloSalida = ruta.tramos[i + 1];

      agregarIntervaloCarga(
        intervalos,
        vueloLlegada.destino,
        llegadaTotalMinutos(vueloLlegada),
        salidaTotalMinutos(vueloSalida),
        ruta.maletas
      );
    }

    // Agregar tiempo de espera en el destino final
    const ultimoVuelo = ruta.tramos[ruta.tramos.length - 1];
    agregarIntervaloCarga(
      intervalos,
      ultimoVuelo.destino,
      llegadaTotalMinutos(ultimoVuelo),
      llegadaTotalMinutos(ultimoVuelo) + TIEMPO_ESPERA_DESTINO,
      ruta.maletas
    );
  }

  const indices: IndicesCargaAeropuertos = {};

  for (const [airportCode, registros] of Object.entries(intervalos)) {
    const iniciosOrdenados = [...registros].sort((a, b) => a.inicio - b.inicio);
    const finesOrdenados = [...registros].sort((a, b) => a.fin - b.fin);
    const inicios: number[] = [];
    const cargasInicio: number[] = [];
    const fines: number[] = [];
    const cargasFin: number[] = [];
    let totalInicio = 0;
    let totalFin = 0;

    for (const registro of iniciosOrdenados) {
      totalInicio += registro.maletas;
      inicios.push(registro.inicio);
      cargasInicio.push(totalInicio);
    }

    for (const registro of finesOrdenados) {
      totalFin += registro.maletas;
      fines.push(registro.fin);
      cargasFin.push(totalFin);
    }

    indices[airportCode] = { inicios, cargasInicio, fines, cargasFin };
  }

  return indices;
}

function upperBound(valores: number[], objetivo: number): number {
  let lo = 0;
  let hi = valores.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (valores[mid] <= objetivo) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBound(valores: number[], objetivo: number): number {
  let lo = 0;
  let hi = valores.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (valores[mid] < objetivo) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function calcularCargasAeropuertosEnMinuto(
  indices: IndicesCargaAeropuertos,
  simTotalMinutos: number
): Record<string, number> {
  const cargas: Record<string, number> = {};

  for (const [airportCode, indice] of Object.entries(indices)) {
    const iniciosIncluidos = upperBound(indice.inicios, simTotalMinutos);
    const finesVencidos = lowerBound(indice.fines, simTotalMinutos);
    const cargaInicio = iniciosIncluidos > 0 ? indice.cargasInicio[iniciosIncluidos - 1] : 0;
    const cargaFin = finesVencidos > 0 ? indice.cargasFin[finesVencidos - 1] : 0;
    const carga = cargaInicio - cargaFin;

    if (carga > 0) cargas[airportCode] = carga;
  }

  return cargas;
}

function calcularCargaPorVuelo(rutas: RutaMuestra[]): Record<string, number> {
  const cargas: Record<string, number> = {};

  for (const ruta of rutas) {
    if (!ruta.tramos) continue;
    const vuelosRuta = new Set<string>();
    for (const tramo of ruta.tramos) {
      const flightKey = `${tramo.vueloId}-${tramo.diaOffset}`;
      if (vuelosRuta.has(flightKey)) continue;
      vuelosRuta.add(flightKey);
      cargas[flightKey] = (cargas[flightKey] || 0) + ruta.maletas;
    }
  }

  return cargas;
}

function isFlying(t: TramoDTO, simTotalMinutos: number) {
  if (t.llegadaMinutosGMT === undefined || t.salidaMinutosGMT === undefined || t.diaOffset === undefined) return false;

  const salidaTotal = salidaTotalMinutos(t);
  const llegadaTotal = llegadaTotalMinutos(t);

  return simTotalMinutos >= salidaTotal && simTotalMinutos <= llegadaTotal;
}

function getInterpolatedPosition(t: TramoDTO, simTotalMinutos: number) {
  const salidaTotal = salidaTotalMinutos(t);
  const llegadaTotal = llegadaTotalMinutos(t);

  const duration = llegadaTotal - salidaTotal;
  const passed = simTotalMinutos - salidaTotal;
  
  let p = duration === 0 ? 1 : passed / duration;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  
  return getGreatCirclePoint(t.origenLat, t.origenLon, t.destinoLat, t.destinoLon, p);
}

function getActiveFlights(tramos: TramoDTO[], current: number) {
  const seen = new Set<string>();
  const active: TramoDTO[] = [];
  
  for (const t of tramos) {
    const flightKey = `${t.vueloId}-${t.diaOffset}`;
    if (!t.vueloId || seen.has(flightKey)) continue;
    if (isFlying(t, current)) {
      seen.add(flightKey);
      active.push(t);
    }
  }
  return active;
}
