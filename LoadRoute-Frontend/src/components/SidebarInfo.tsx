import React, { useState } from 'react';
import { RutaMuestra, AeropuertoDTO } from '@/types/rutas';

interface SidebarInfoProps {
  envios: RutaMuestra[];
  aeropuertos: AeropuertoDTO[];
  activeTab: 'pedidos' | 'aeropuertos' | 'simulacion' | null;
  onSelectEnvio: (e: RutaMuestra) => void;
  onSelectAeropuerto: (a: AeropuertoDTO) => void;
}

export default function SidebarInfo({
  envios,
  aeropuertos,
  activeTab,
  onSelectEnvio,
  onSelectAeropuerto,
}: SidebarInfoProps) {
  const [searchEnvios, setSearchEnvios] = useState('');
  const [searchAero, setSearchAero] = useState('');

  const filteredEnvios = envios.filter(e => {
    const q = searchEnvios.toLowerCase();
    if (!q) return true;
    return (
      e.envioId.toLowerCase().includes(q) ||
      e.origen.toLowerCase().includes(q) ||
      e.destino.toLowerCase().includes(q)
    );
  });

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
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
            Pedidos ({filteredEnvios.length}/{envios.length})
          </p>
          {/* Search */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchEnvios}
              onChange={e => setSearchEnvios(e.target.value)}
              placeholder="Buscar por ID, origen o destino..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-2
                         text-xs text-slate-200 placeholder-slate-500
                         focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
                         transition-all"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {filteredEnvios.length === 0 ? (
            <p className="text-center text-slate-600 text-xs pt-8">Sin resultados</p>
          ) : (
            filteredEnvios.map(e => (
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
            ))
          )}
        </div>
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
