import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TramoDTO, RutaMuestra, AeropuertoDTO } from '@/types/rutas';
import { IconSearch } from '@/components/icons';

type SortKey = 'none' | 'ocupacion_desc' | 'ocupacion_asc' | 'salida_asc' | 'llegada_asc' | 'origen_az' | 'destino_az';

interface SidebarVuelosProps {
  vuelos: TramoDTO[];
  cancelacionesPorDia: number[][];
  simDia: number;
  maxDia: number;
  rutasActivas?: RutaMuestra[];
  umbralVerde?: number;
  umbralAmbar?: number;
  onSelectVuelo?: (vuelo: TramoDTO) => void;
  selectedVuelo?: TramoDTO | null;
  aeropuertos?: AeropuertoDTO[];
  simTiempoMinutos?: number;
  filtroSemaforo?: 'todos' | 'verde' | 'ambar' | 'rojo';
  onChangeFiltroSemaforo?: (f: 'todos' | 'verde' | 'ambar' | 'rojo') => void;
}

function formatMinutosGMT(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = Math.floor(minutos % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Calcula maletas cargadas en cada vuelo en el día seleccionado */
function calcularOcupacionPorVuelo(
  rutasActivas: RutaMuestra[],
  diaSeleccionado: number
): Record<number, { carga: number; capacidad: number }> {
  const occ: Record<number, { carga: number; capacidad: number }> = {};
  for (const ruta of rutasActivas) {
    if (!ruta.tramos) continue;
    for (const tramo of ruta.tramos) {
      if ((tramo.diaOffset ?? 0) !== diaSeleccionado) continue;
      if (!occ[tramo.vueloId]) {
        occ[tramo.vueloId] = { carga: 0, capacidad: tramo.capacidad };
      }
      occ[tramo.vueloId].carga += ruta.maletas;
    }
  }
  return occ;
}

function getSemaforoColor(pct: number, umbralVerde: number, umbralAmbar: number) {
  if (pct <= umbralVerde) return { text: 'text-emerald-400', bg: 'bg-emerald-500', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', row: 'border-emerald-700/30 bg-emerald-950/10' };
  if (pct <= umbralAmbar) return { text: 'text-amber-400',   bg: 'bg-amber-500',   badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',     row: 'border-amber-700/30 bg-amber-950/10'   };
  return                         { text: 'text-red-400',     bg: 'bg-red-500',     badge: 'bg-red-500/20 text-red-300 border-red-500/30',             row: 'border-red-700/30 bg-red-950/10'       };
}

export default function SidebarVuelos({
  vuelos,
  cancelacionesPorDia,
  simDia,
  maxDia,
  rutasActivas = [],
  umbralVerde = 30,
  umbralAmbar = 70,
  onSelectVuelo,
  selectedVuelo,
  fechaInicioRaw,
  aeropuertos,
  simTiempoMinutos,
  filtroSemaforo = 'todos',
  onChangeFiltroSemaforo,
}: SidebarVuelosProps) {
  const [selectedDia, setSelectedDia] = useState<number>(simDia);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>('none');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(10);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'cancelados' | 'operativos'>('todos');

  const getFechaGmtLabel = useCallback((index: number) => {
    if (!fechaInicioRaw || fechaInicioRaw.length < 8) return `Día ${index + 1}`;
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    const date = new Date(Date.UTC(y, m, d));
    date.setUTCDate(date.getUTCDate() + index);
    
    const day = date.getUTCDate();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
    const month = monthNames[date.getUTCMonth()];
    return `Día ${index + 1} (${day}-${month} GMT)`;
  }, [fechaInicioRaw]);

  const getLocalDayLabel = useCallback((diaOffset: number, minutosGMT: number, gmtOffset: number) => {
    if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    
    const date = new Date(Date.UTC(y, m, d));
    date.setUTCDate(date.getUTCDate() + diaOffset);
    date.setUTCHours(0, minutosGMT, 0, 0);
    date.setUTCHours(date.getUTCHours() + gmtOffset);
    
    const day = date.getUTCDate();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
    const month = monthNames[date.getUTCMonth()];
    return ` (${day}-${month})`;
  }, [fechaInicioRaw]);

  const getGmtDayLabel = useCallback((diaOffset: number, minutosGMT: number) => {
    if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    
    const date = new Date(Date.UTC(y, m, d));
    date.setUTCDate(date.getUTCDate() + diaOffset);
    date.setUTCHours(0, minutosGMT, 0, 0);
    
    const day = date.getUTCDate();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
    const month = monthNames[date.getUTCMonth()];
    return ` (${day}-${month})`;
  }, [fechaInicioRaw]);

  // Sincronizar selectedDia con simDia cuando avanza la simulación
  useEffect(() => {
    setSelectedDia(Math.min(simDia, maxDia));
  }, [simDia, maxDia]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, selectedDia, filtroEstado, filtroSemaforo]);

  // Ajustar cantidad de elementos por página según la altura de la pantalla
  useEffect(() => {
    const handleResize = () => {
      const height = window.innerHeight;
      // Header is about 180px + paginación 45px + padding/márgenes. Fila de vuelo mide 110px aprox.
      const size = Math.max(3, Math.floor((height - 250) / 110));
      setPageSize(size);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isVueloEnElAire = useCallback((v: TramoDTO) => {
    if (simTiempoMinutos === undefined) return false;
    const salidaTotal = selectedDia * 1440 + v.salidaMinutosGMT;
    let llegadaTotal = selectedDia * 1440 + v.llegadaMinutosGMT;
    if (v.llegadaMinutosGMT < v.salidaMinutosGMT) {
      llegadaTotal += 1440;
    }
    return simTiempoMinutos >= salidaTotal && simTiempoMinutos <= llegadaTotal;
  }, [selectedDia, simTiempoMinutos]);

  const cancelacionesActivas = useMemo(
    () => new Set(cancelacionesPorDia[selectedDia] || []),
    [cancelacionesPorDia, selectedDia]
  );

  const ocupacionPorVuelo = useMemo(
    () => calcularOcupacionPorVuelo(rutasActivas, selectedDia),
    [rutasActivas, selectedDia]
  );

  const filteredBySearch = useMemo(() => {
    return vuelos.filter(v => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        v.vueloId.toString().includes(q) ||
        v.origen.toLowerCase().includes(q) ||
        v.destino.toLowerCase().includes(q)
      );
    });
  }, [vuelos, searchTerm]);

  const totalCancelados = useMemo(() => {
    return filteredBySearch.filter(v => cancelacionesActivas.has(v.vueloId)).length;
  }, [filteredBySearch, cancelacionesActivas]);

  const totalActivos = filteredBySearch.length - totalCancelados;

  const filtered = useMemo(() => {
    let result = filteredBySearch;

    if (filtroEstado !== 'todos') {
      result = result.filter(v => {
        const isCancelled = cancelacionesActivas.has(v.vueloId);
        return filtroEstado === 'cancelados' ? isCancelled : !isCancelled;
      });
    }

    if (filtroSemaforo !== 'todos') {
      result = result.filter(v => {
        const isCancelled = cancelacionesActivas.has(v.vueloId);
        if (isCancelled) return false;

        const oc = ocupacionPorVuelo[v.vueloId];
        const pct = oc ? Math.round((oc.carga / Math.max(oc.capacidad, 1)) * 100) : 0;
        
        const esVerde = pct <= umbralVerde;
        const esAmbar = !esVerde && pct <= umbralAmbar;
        const esRojo = !esVerde && !esAmbar;

        if (filtroSemaforo === 'verde' && !esVerde) return false;
        if (filtroSemaforo === 'ambar' && !esAmbar) return false;
        if (filtroSemaforo === 'rojo' && !esRojo) return false;
        return true;
      });
    }

    if (sortKey !== 'none') {
      result = [...result].sort((a, b) => {
        const ocA = ocupacionPorVuelo[a.vueloId];
        const ocB = ocupacionPorVuelo[b.vueloId];
        switch (sortKey) {
          case 'ocupacion_desc': {
            const pA = ocA ? (ocA.carga / Math.max(ocA.capacidad, 1)) * 100 : 0;
            const pB = ocB ? (ocB.carga / Math.max(ocB.capacidad, 1)) * 100 : 0;
            return pB - pA;
          }
          case 'ocupacion_asc': {
            const airA = isVueloEnElAire(a);
            const airB = isVueloEnElAire(b);
            if (airA && !airB) return -1;
            if (!airA && airB) return 1;

            const pA = ocA ? (ocA.carga / Math.max(ocA.capacidad, 1)) * 100 : 0;
            const pB = ocB ? (ocB.carga / Math.max(ocB.capacidad, 1)) * 100 : 0;
            return pA - pB;
          }
          case 'salida_asc':  return a.salidaMinutosGMT - b.salidaMinutosGMT;
          case 'llegada_asc': return a.llegadaMinutosGMT - b.llegadaMinutosGMT;
          case 'origen_az':   return a.origen.localeCompare(b.origen);
          case 'destino_az':  return a.destino.localeCompare(b.destino);
          default: return 0;
        }
      });
    }

    return result;
  }, [filteredBySearch, filtroEstado, cancelacionesActivas, sortKey, ocupacionPorVuelo, isVueloEnElAire, filtroSemaforo, umbralVerde, umbralAmbar]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedVuelos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const cancelados = totalCancelados;
  const activos    = totalActivos;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-2 bg-[#0f1f3d]/80 border-b border-slate-700/50 shrink-0 space-y-2 backdrop-blur-sm">
        <div className="flex justify-between items-center">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
            Vuelos de la Red
          </p>
          <select
            value={selectedDia}
            onChange={e => setSelectedDia(Number(e.target.value))}
            className="bg-slate-800 text-slate-200 text-xs border border-slate-700 rounded px-2 py-1 outline-none focus:border-orange-500/50"
          >
            {Array.from({ length: maxDia + 1 }).map((_, i) => (
              <option key={i} value={i}>{getFechaGmtLabel(i)}</option>
            ))}
          </select>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, origen o destino..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-1.5
                       text-xs text-slate-200 placeholder-slate-500
                       focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20"
          />
        </div>

        {/* Ordenar */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                     text-xs text-slate-300 outline-none focus:border-orange-500/50"
        >
          <option value="none">Ordenar por...</option>
          <option value="ocupacion_desc">↓ Ocupación (mayor primero)</option>
          <option value="ocupacion_asc">↑ Ocupación (menor primero)</option>
          <option value="salida_asc">Hora salida (próxima)</option>
          <option value="llegada_asc">Hora llegada (próxima)</option>
          <option value="origen_az">Origen (A–Z)</option>
          <option value="destino_az">Destino (A–Z)</option>
        </select>

        {/* Filtros de Estado */}
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={() => setFiltroEstado('todos')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroEstado === 'todos'
                ? 'bg-slate-700 bg-opacity-60 text-slate-100 border-slate-600'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroEstado('operativos')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroEstado === 'operativos'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Operativos
          </button>
          <button
            onClick={() => setFiltroEstado('cancelados')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroEstado === 'cancelados'
                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Cancelados
          </button>
        </div>

        {/* Filtros de Semáforo */}
        <div className="flex gap-1.5 pt-0.5">
          <button
            onClick={() => onChangeFiltroSemaforo?.('todos')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroSemaforo === 'todos'
                ? 'bg-slate-700 bg-opacity-60 text-slate-100 border-slate-600'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Todos Colores
          </button>
          <button
            onClick={() => onChangeFiltroSemaforo?.('verde')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroSemaforo === 'verde'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Verde
          </button>
          <button
            onClick={() => onChangeFiltroSemaforo?.('ambar')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroSemaforo === 'ambar'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Ámbar
          </button>
          <button
            onClick={() => onChangeFiltroSemaforo?.('rojo')}
            className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
              filtroSemaforo === 'rojo'
                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
            }`}
          >
            Rojo
          </button>
        </div>

        {/* Stats */}
        <div className="flex justify-between text-[10px] px-0.5">
          <span className="text-slate-400">{activos} programados</span>
          {cancelados > 0 && (
            <span className="text-red-400 font-bold">{cancelados} cancelados</span>
          )}
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {paginatedVuelos.map(v => {
          const isSelected = selectedVuelo?.vueloId === v.vueloId;
          const isCancelled = cancelacionesActivas.has(v.vueloId);
          const isAir = isVueloEnElAire(v);
          const oc = ocupacionPorVuelo[v.vueloId];
          const pct = oc ? Math.round((oc.carga / Math.max(oc.capacidad, 1)) * 100) : 0;
          const sem = !isCancelled && oc ? getSemaforoColor(pct, umbralVerde, umbralAmbar) : null;

          let rowClass = isCancelled
            ? 'bg-red-950/20 border-red-900/50'
            : sem
              ? `${sem.row} hover:brightness-110`
              : 'bg-[#122340] border-slate-700/50 hover:bg-[#162a4d]';

          if (isSelected) {
            rowClass += ' ring-2 ring-orange-500 shadow-lg shadow-orange-500/20';
          }

          const origenAero = aeropuertos?.find(a => a.codigo === v.origen);
          const destinoAero = aeropuertos?.find(a => a.codigo === v.destino);
          const gmtOrigen = origenAero?.gmt ?? 0;
          const gmtDestino = destinoAero?.gmt ?? 0;

          const gmtSalidaLabel = getGmtDayLabel(selectedDia, v.salidaMinutosGMT);
          const gmtLlegadaLabel = getGmtDayLabel(
            selectedDia + (v.llegadaMinutosGMT < v.salidaMinutosGMT ? 1 : 0),
            v.llegadaMinutosGMT
          );

          return (
            <div
              key={`${v.vueloId}-${v.diaOffset ?? 0}`}
              onClick={() => {
                let tramoEnElAire = null;

                // Buscamos el tramo activo real en el día seleccionado
                for (const ruta of rutasActivas) {
                  const encontrado = ruta.tramos?.find(
                    (t) => t.vueloId === v.vueloId && (t.diaOffset ?? 0) === selectedDia
                  );
                  if (encontrado) {
                    tramoEnElAire = encontrado;
                    break;
                  }
                }

                // Inyectamos el tramo exacto en el aire o el maestro con el día actual asignado
                onSelectVuelo?.(tramoEnElAire || { ...v, diaOffset: selectedDia });
              }}
              className={`border rounded-lg p-3 transition-all cursor-pointer ${rowClass}`}
            >
              {/* Fila superior: ID + badge */}
              <div className="flex justify-between items-start mb-1.5">
                <span className={`font-mono text-sm font-bold ${isCancelled ? 'text-red-300' : 'text-slate-200'}`}>
                  Vuelo #{v.vueloId}
                </span>
                {isCancelled ? (
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30 font-semibold uppercase tracking-wider">
                    Cancelado
                  </span>
                ) : oc ? (
                  <div className="flex gap-1.5 items-center">
                    {isAir && (
                      <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-[9px] rounded border border-blue-500/30 font-bold uppercase tracking-wider">
                        En el aire
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-[10px] rounded border font-semibold ${sem!.badge}`}>
                      {pct}%
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-1.5 items-center">
                    {isAir && (
                      <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-[9px] rounded border border-blue-500/30 font-bold uppercase tracking-wider">
                        En el aire
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-slate-700/40 text-slate-400 text-[10px] rounded border border-slate-600/30">
                      Sin datos
                    </span>
                  </div>
                )}
              </div>

              {/* Ruta */}
              <div className="flex items-center gap-2 text-xs font-mono mb-1.5">
                <span className={isCancelled ? 'text-red-300/70' : 'text-orange-300'}>{v.origen}</span>
                <span className="text-slate-400">→</span>
                <span className={isCancelled ? 'text-red-300/70' : 'text-orange-300'}>{v.destino}</span>
              </div>

              {/* Barra de ocupación */}
              {oc && !isCancelled && (
                <div className="mb-1.5">
                  <div className="flex justify-between text-[10px] text-slate-200 mb-1">
                    <span>{oc.carga.toLocaleString()} / {oc.capacidad.toLocaleString()} maletas</span>
                    <span className={sem!.text}>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/80">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${sem!.bg}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Horarios */}
              <div className="flex justify-between text-[10px] text-slate-300">
                <span>Sale: {formatMinutosGMT(v.salidaMinutosGMT)} GMT{gmtSalidaLabel}</span>
                <span>Llega: {formatMinutosGMT(v.llegadaMinutosGMT)} GMT{gmtLlegadaLabel}</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-8">No se encontraron vuelos.</p>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Anterior
          </button>
          <span className="text-[10px] font-mono text-slate-400">
            Pág. {currentPage} de {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}