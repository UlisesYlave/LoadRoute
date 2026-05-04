import React, { useState, useMemo, useEffect } from 'react';
import { RutaMuestra, AeropuertoDTO } from '@/types/rutas';

interface SidebarInfoProps {
  envios: RutaMuestra[];
  aeropuertos: AeropuertoDTO[];
  activeTab: 'pedidos' | 'aeropuertos' | 'simulacion' | null;
  onSelectEnvio: (e: RutaMuestra) => void;
  onSelectAeropuerto: (a: AeropuertoDTO) => void;
  totalEnviosGlobal: number;
  fechaInicioRaw: string;
}

function getFechaLocal(minutos: number, fechaInicioRaw: string): string {
    if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    const date = new Date(y, m, d);
    date.setMinutes(date.getMinutes() + minutos);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

export default function SidebarInfo({
  envios,
  aeropuertos,
  activeTab,
  onSelectEnvio,
  onSelectAeropuerto,
  totalEnviosGlobal,
  fechaInicioRaw,
}: SidebarInfoProps) {
  const [searchAero, setSearchAero] = useState('');
  
  // Pedidos state
  const [filtroOrigen, setFiltroOrigen] = useState('');
  const [filtroDestino, setFiltroDestino] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 50;

  const filteredEnvios = useMemo(() => {
    let result = envios;
    if (filtroOrigen) result = result.filter(e => e.origen === filtroOrigen);
    if (filtroDestino) result = result.filter(e => e.destino === filtroDestino);
    if (filtroFecha) {
      result = result.filter(e => getFechaLocal(e.recepcionAbsMinutos, fechaInicioRaw) === filtroFecha);
    }
    return result;
  }, [envios, filtroOrigen, filtroDestino, filtroFecha, fechaInicioRaw]);

  const totalPaginasEnvios = Math.max(1, Math.ceil(filteredEnvios.length / ITEMS_POR_PAGINA));
  const enviosPaginados = filteredEnvios.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA);

  useEffect(() => {
    if (paginaActual > totalPaginasEnvios) setPaginaActual(1);
  }, [totalPaginasEnvios, paginaActual]);

  const filteredAero = aeropuertos.filter(a => {
    const q = searchAero.toLowerCase();
    if (!q) return true;
    return (
      a.codigo.toLowerCase().includes(q) ||
      a.ciudad.toLowerCase().includes(q) ||
      a.pais.toLowerCase().includes(q)
    );
  });

  if (activeTab === 'pedidos') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 bg-[#0f1f3d] border-b border-slate-700/50 shrink-0">
          <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mb-2">
            Total Pedidos: {totalEnviosGlobal.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500 mb-2">Muestra actual: {filteredEnvios.length} filtrados</p>
          {/* Filters */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <select 
                value={filtroOrigen}
                onChange={e => setFiltroOrigen(e.target.value)}
                className="w-1/2 bg-slate-800/60 border border-slate-700/60 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Cualquier Origen</option>
                {aeropuertos.map(a => <option key={`ori-${a.codigo}`} value={a.codigo}>{a.codigo} - {a.ciudad}</option>)}
              </select>
              <select 
                value={filtroDestino}
                onChange={e => setFiltroDestino(e.target.value)}
                className="w-1/2 bg-slate-800/60 border border-slate-700/60 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Cualquier Destino</option>
                {aeropuertos.map(a => <option key={`des-${a.codigo}`} value={a.codigo}>{a.codigo} - {a.ciudad}</option>)}
              </select>
            </div>
            <input 
              type="date"
              value={filtroFecha}
              onChange={e => setFiltroFecha(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 [color-scheme:dark]"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {enviosPaginados.length === 0 ? (
            <p className="text-center text-slate-600 text-xs pt-8">No hay pedidos con estos filtros</p>
          ) : (
            <>
              {enviosPaginados.map(e => (
                <div
                  key={e.envioId}
                  onClick={() => onSelectEnvio(e)}
                  className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 cursor-pointer
                             hover:border-blue-500/50 hover:bg-[#162a4d] transition-all"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-xs text-blue-400">{e.envioId}</span>
                    <span className="bg-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-400">
                      {e.maletas} maletas
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-300">
                    <span>{e.origen}</span>
                    <span className="text-slate-500 text-[10px]">→</span>
                    <span>{e.destino}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {/* Pagination */}
        {totalPaginasEnvios > 1 && (
          <div className="px-3 py-2 bg-[#0f1f3d] border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <button 
              onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
              className="px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            <span>Pág {paginaActual} de {totalPaginasEnvios}</span>
            <button 
              onClick={() => setPaginaActual(p => Math.min(totalPaginasEnvios, p + 1))}
              disabled={paginaActual === totalPaginasEnvios}
              className="px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'aeropuertos') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 bg-[#0f1f3d] border-b border-slate-700/50 shrink-0">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
            Aeropuertos ({filteredAero.length}/{aeropuertos.length})
          </p>
          {/* Search */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchAero}
              onChange={e => setSearchAero(e.target.value)}
              placeholder="Buscar por código, ciudad o país..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-2
                         text-xs text-slate-200 placeholder-slate-500
                         focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20
                         transition-all"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {filteredAero.length === 0 ? (
            <p className="text-center text-slate-600 text-xs pt-8">Sin resultados</p>
          ) : (
            filteredAero.map(a => (
              <div
                key={a.codigo}
                onClick={() => onSelectAeropuerto(a)}
                className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 cursor-pointer
                           hover:border-emerald-500/50 hover:bg-[#162a4d] transition-all"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-200">{a.codigo}</span>
                  <span className="text-[10px] text-slate-400">{a.pais}</span>
                </div>
                <p className="text-xs text-slate-400 truncate">{a.ciudad}</p>
                <p className="text-xs mt-1 text-slate-500">
                  Cap. Máx: <span className="text-emerald-400">{a.capacidadMax}</span>
                  <span className="mx-1.5 text-slate-700">|</span>
                  GMT{a.gmt >= 0 ? '+' : ''}{a.gmt}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
