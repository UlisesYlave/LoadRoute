'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ControlPanel from '@/components/ControlPanel';
import SidebarInfo from '@/components/SidebarInfo';
import ModalEnvio from '@/components/ModalEnvio';
import ModalAeropuerto from '@/components/ModalAeropuerto';
import ModalVuelo from '@/components/ModalVuelo';
import ResultadosPanel from '@/components/ResultadosPanel';
import { RutaResponse, RutaMuestra, AeropuertoDTO, TramoDTO } from '@/types/rutas';
import { verificarSaludBackend } from '@/services/ruteoService';

const MapaRutas = dynamic(() => import('@/components/MapaRutas'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full rounded-lg bg-[#0f1f3d]/50 border border-slate-700/50">
      <div className="text-4xl mb-3 animate-spin">🗺️</div>
      <p className="text-slate-400 text-sm">Cargando mapa...</p>
    </div>
  ),
});

// ── Tipos de tabs ──
type TabId = 'pedidos' | 'aeropuertos' | 'simulacion';
type ModoMapa = 'sa' | 'alns' | 'ambos';

const NAV_TABS: { id: TabId; icon: string; label: string; color: string }[] = [
  { id: 'pedidos',      icon: '📦', label: 'Pedidos',      color: 'blue'    },
  { id: 'aeropuertos',  icon: '🏢', label: 'Aeropuertos',  color: 'emerald' },
  { id: 'simulacion',   icon: '⚙️', label: 'Simulación',   color: 'violet'  },
];

// ── Helper: fecha de simulación ──
function formatFechaSimulacion(fechaInicioRaw: string, simDia: number): string {
  if (!fechaInicioRaw || fechaInicioRaw.length < 8) return `Día ${simDia + 1}`;
  const y = parseInt(fechaInicioRaw.slice(0, 4));
  const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d = parseInt(fechaInicioRaw.slice(6, 8));
  const base = new Date(Date.UTC(y, m, d));
  base.setUTCDate(base.getUTCDate() + simDia);
  return base.toLocaleDateString('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
}

function formatRawDateToShort(raw: string): string {
  if (!raw || raw.length < 8) return '';
  const y = parseInt(raw.slice(0, 4));
  const m = parseInt(raw.slice(4, 6)) - 1;
  const d = parseInt(raw.slice(6, 8));
  const base = new Date(Date.UTC(y, m, d));
  return base.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function getDiasRango(fechaInicioRaw?: string, fechaFinRaw?: string): number | null {
  if (!fechaInicioRaw || !fechaFinRaw || fechaInicioRaw.length < 8 || fechaFinRaw.length < 8) {
    return null;
  }

  const inicio = new Date(
    Number(fechaInicioRaw.slice(0, 4)),
    Number(fechaInicioRaw.slice(4, 6)) - 1,
    Number(fechaInicioRaw.slice(6, 8))
  );
  const fin = new Date(
    Number(fechaFinRaw.slice(0, 4)),
    Number(fechaFinRaw.slice(4, 6)) - 1,
    Number(fechaFinRaw.slice(6, 8))
  );

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) {
    return null;
  }

  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.floor((fin.getTime() - inicio.getTime()) / MS_POR_DIA);
}

function formatoHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const mn = Math.floor(minutos % 60);
  return `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')} GMT`;
}

// ── Componente tab de Simulación (panel izquierdo) ──
function SimulacionPanel({
  simDia, simTiempoMinutos, fechaInicioRaw, isPlaying, rangoFinalizado,
  onPlay, onPause, onStop, onReiniciar,
  umbralVerde, umbralAmbar, onUmbralVerde, onUmbralAmbar,
}: {
  simDia: number;
  simTiempoMinutos: number;
  fechaInicioRaw: string;
  isPlaying: boolean;
  rangoFinalizado: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReiniciar: () => void;
  umbralVerde: number;
  umbralAmbar: number;
  onUmbralVerde: (v: number) => void;
  onUmbralAmbar: (v: number) => void;
}) {
  return (
    <div className="flex flex-col h-full p-4 space-y-5 overflow-y-auto custom-scrollbar">
      {/* Fecha + Hora */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Fecha de Simulación
        </p>
        <p className="text-sm font-medium text-slate-300 mb-3 capitalize">
          {formatFechaSimulacion(fechaInicioRaw, simDia)}
        </p>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Hora GMT
        </p>
        <p className="text-3xl font-mono text-emerald-400 font-bold tracking-wider">
          {formatoHora(simTiempoMinutos)}
        </p>
        {rangoFinalizado && (
          <p className="mt-3 text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">
            Rango finalizado
          </p>
        )}
      </div>

      {/* Controles de reproducción */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Controles</p>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={onPlay} disabled={isPlaying || rangoFinalizado}
            className={`flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-all
              ${isPlaying ? 'bg-blue-600/80 text-white ring-1 ring-blue-400/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}
              ${rangoFinalizado ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span className="text-base">▶</span>Iniciar
          </button>
          <button onClick={onPause} disabled={!isPlaying}
            className={`flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-all
              ${!isPlaying ? 'bg-amber-600/80 text-white ring-1 ring-amber-400/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
            <span className="text-base">⏸</span>Pausar
          </button>
          <button onClick={onStop}
            className="flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-red-900/40 hover:text-red-400 transition-all">
            <span className="text-base">⏹</span>Detener
          </button>
        </div>
      </div>

      {/* Leyenda dinámica de capacidad */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Umbral de Capacidad</p>
        <div className="space-y-3">
          {/* Verde */}
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Verde</span><span>0–{umbralVerde}%</span>
              </div>
              <input type="range" min={1} max={umbralAmbar - 5} value={umbralVerde}
                onChange={e => onUmbralVerde(Number(e.target.value))}
                className="w-full h-1 cursor-pointer accent-emerald-500" />
            </div>
          </div>
          {/* Ámbar */}
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Ámbar</span><span>{umbralVerde + 1}–{umbralAmbar}%</span>
              </div>
              <input type="range" min={umbralVerde + 5} max={95} value={umbralAmbar}
                onChange={e => onUmbralAmbar(Number(e.target.value))}
                className="w-full h-1 cursor-pointer accent-amber-500" />
            </div>
          </div>
          {/* Rojo (fijo) */}
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <span className="text-[10px] text-slate-400">Rojo — {umbralAmbar + 1}–100%</span>
          </div>
        </div>
      </div>

      {/* Separador */}
      <div className="border-t border-slate-700/50" />

      {/* Cargar nuevos datos */}
      <button
        onClick={onReiniciar}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-slate-600/50
                   text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 hover:border-slate-500
                   transition-all"
      >
        <span>🔄</span>
        Cargar nuevos datos
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════
export default function Home() {
  const [resultado,       setResultado]       = useState<RutaResponse | null>(null);
  const [error,           setError]           = useState('');
  const [backendActivo,   setBackendActivo]   = useState<boolean | null>(null);
  const [cargando,        setCargando]        = useState(false);
  const [logMsg,          setLogMsg]          = useState<string | null>(null);

  // Modals
  const [envioModal,  setEnvioModal]  = useState<RutaMuestra | null>(null);
  const [aeroModal,   setAeroModal]   = useState<AeropuertoDTO | null>(null);
  const [vueloModal,  setVueloModal]  = useState<TramoDTO | null>(null);

  // Simulación
  const [simTiempoMinutos, setSimTiempoMinutos] = useState(0);
  const [simDia,           setSimDia]           = useState(0);
  const [isPlaying,        setIsPlaying]        = useState(false);
  const [playbackSeconds,  setPlaybackSeconds]  = useState(0);
  const [fechaInicioRaw,   setFechaInicioRaw]   = useState(''); // YYYYMMDD
  const [fechaFinRaw,      setFechaFinRaw]      = useState(''); // YYYYMMDD
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTiempoPlayback = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Layout
  const [activeTab,        setActiveTab]        = useState<TabId | null>(null);
  const [panelResultOpen,  setPanelResultOpen]  = useState(false);
  const [modoMapa,         setModoMapa]         = useState<ModoMapa>('alns');

  // Umbrales dinámicos de capacidad
  const [umbralVerde, setUmbralVerde] = useState(30);
  const [umbralAmbar, setUmbralAmbar] = useState(70);
  const maxSimDia = getDiasRango(fechaInicioRaw, fechaFinRaw);
  const rangoFinalizado = maxSimDia !== null && simDia >= maxSimDia && simTiempoMinutos >= 1439;

  useEffect(() => {
    verificarSaludBackend().then(setBackendActivo);
  }, []);

  // Timer — detecta cruce de medianoche para incrementar día
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setPlaybackSeconds(p => p + 0.05);
        setSimTiempoMinutos(prev => {
          // Aumento de 0.28 minutos simulados por cada 50ms de tiempo real.
          // Esto equivale a ~5.6 minutos simulados por segundo real.
          // 7 días = 10080 minutos simulados -> 10080 / 5.6 = 1800 segundos reales (30 minutos)
          const next = prev + 0.28;
          if (next >= 1440) {
            if (maxSimDia !== null && simDia >= maxSimDia) {
              setIsPlaying(false);
              return 1439;
            }
            setSimDia(d => d + 1);
            return next % 1440;
          }
          return next;
        });
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, maxSimDia, simDia]);

  const handleReiniciar = () => {
    setResultado(null);
    setIsPlaying(false);
    setSimTiempoMinutos(0);
    setSimDia(0);
    setPlaybackSeconds(0);
    setFechaInicioRaw('');
    setFechaFinRaw('');
  };

  const handleStop = () => {
    setIsPlaying(false);
    setSimTiempoMinutos(0);
    setSimDia(0);
    setPlaybackSeconds(0);
  };

  const handleTabClick = useCallback((id: TabId) => {
    setActiveTab(prev => prev === id ? null : id);
  }, []);

  // ── Clamp umbral verde para que no supere ámbar
  const handleUmbralVerde = (val: number) => {
    setUmbralVerde(val);
    if (val >= umbralAmbar) setUmbralAmbar(Math.min(val + 5, 99));
  };
  const handleUmbralAmbar = (val: number) => {
    setUmbralAmbar(val);
    if (val <= umbralVerde) setUmbralVerde(Math.max(val - 5, 1));
  };

  // ══════════════════════════════════════════════
  // VISTA CARGA DE DATOS (pantalla inicial)
  // ══════════════════════════════════════════════
  if (!resultado) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full bg-[#0c1a30] border border-slate-700/40 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/logo.png" alt="LoadRoute Logo" className="h-24 mb-4" />
            <p className="text-slate-400 text-sm mt-2">
              Cargue los datos maestros para inicializar el Dashboard de Simulación
            </p>
          </div>
          <ControlPanel
            onResultado={(res) => {
              setResultado(prev => {
                if (!prev) {
                  setSimTiempoMinutos(0);
                  setSimDia(0);
                  setPlaybackSeconds(0);
                }
                return res;
              });
              setFechaInicioRaw(res.fechaInicio || fechaInicioRaw);
              setFechaFinRaw(res.fechaFin || '');
              setIsPlaying(true);
              setActiveTab(null);
              setPanelResultOpen(false);
            }}
            onPartialResult={(partialRes) => {
              setResultado(prev => {
                if (!prev) {
                  setSimTiempoMinutos(0);
                  setSimDia(0);
                  setPlaybackSeconds(0);
                  setFechaInicioRaw(partialRes.fechaInicio || fechaInicioRaw);
                  setFechaFinRaw(partialRes.fechaFin || '');
                  setIsPlaying(true);
                  setActiveTab(null);
                  setPanelResultOpen(false);
                }
                return partialRes;
              });
              const msg = `Bloque de 8 horas recibido (Iteraciones: ${partialRes.resultadoSA?.iteraciones || 0})`;
              console.log("✈️ [Rolling Horizon]", msg);
              setLogMsg(msg);
              setTimeout(() => setLogMsg(null), 4000);
            }}
            onError={setError}
            onCargando={setCargando}
            onFechaInicio={setFechaInicioRaw}
          />
          {error && (
            <div className="p-3 mt-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-xs fade-in-up text-center">
              {error}
            </div>
          )}
          {cargando && (
            <div className="flex justify-center items-center gap-2 p-3 mt-4 text-blue-400 text-sm animate-pulse">
              <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
              Procesando algoritmos en servidor...
            </div>
          )}
          <div className="mt-8 flex justify-center">
            <div className={`text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-full border
              ${backendActivo
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${backendActivo ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              Backend: {backendActivo ? 'Conectado' : 'Offline'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // VISTA DASHBOARD
  // ══════════════════════════════════════════════
  const rutasActivas = resultado?.resultadoALNS?.rutasMuestra || resultado?.resultadoSA?.rutasMuestra || [];

  return (
    <div className="h-screen bg-[#0a1628] flex flex-col overflow-hidden text-slate-200">

      {/* ── HEADER ── */}
      <header className="bg-[#0f1f3d] border-b border-slate-700/50 px-4 py-2.5 flex items-center gap-4 shrink-0">
        <img src="/logo.png" alt="LoadRoute Logo" className="h-9 shrink-0" />
        <div className="flex-1" />
        <div className={`text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0
          ${backendActivo
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${backendActivo ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          Backend: {backendActivo ? 'Conectado' : 'Offline'}
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── NAV STRIP (56px) ── */}
        <nav className="w-14 bg-[#0c1a30] border-r border-slate-700/50 flex flex-col items-center py-4 gap-2 shrink-0">
          {NAV_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const activeColors: Record<string, string> = {
              blue:    'bg-blue-500/20 text-blue-400 shadow-blue-500/20',
              emerald: 'bg-emerald-500/20 text-emerald-400 shadow-emerald-500/20',
              violet:  'bg-violet-500/20 text-violet-400 shadow-violet-500/20',
            };
            return (
              <div key={tab.id} className="relative group">
                <button
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-200
                    ${isActive
                      ? `${activeColors[tab.color]} shadow-lg ring-1 ring-current/20`
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-700/60'}`}
                  aria-label={tab.label}
                >
                  {tab.icon}
                </button>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5
                                bg-slate-800 text-slate-100 text-xs rounded-lg border border-slate-700
                                whitespace-nowrap shadow-xl
                                opacity-0 group-hover:opacity-100 transition-opacity duration-150
                                pointer-events-none z-50">
                  {tab.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── PANEL LATERAL (deslizable) ── */}
        <div
          className="overflow-hidden shrink-0 border-r border-slate-700/50 bg-[#0c1a30] flex flex-col"
          style={{ width: activeTab ? '320px' : '0px', transition: 'width 0.25s ease' }}
        >
          {/* Este div siempre tiene 320px de ancho; el padre lo recorta con overflow-hidden */}
          <div className="w-80 flex flex-col" style={{ height: '100%' }}>
            {/* Header del panel con botón cerrar */}
            <div className="px-4 py-3 bg-[#0f1f3d] border-b border-slate-700/50 shrink-0 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {NAV_TABS.find(t => t.id === activeTab)?.label ?? ''}
              </span>
              <button
                onClick={() => setActiveTab(null)}
                className="text-slate-600 hover:text-slate-300 text-lg leading-none transition-colors"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            </div>
            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {(activeTab === 'pedidos' || activeTab === 'aeropuertos') && (
                <SidebarInfo
                  envios={rutasActivas}
                  aeropuertos={resultado.aeropuertos}
                  activeTab={activeTab}
                  onSelectEnvio={setEnvioModal}
                  onSelectAeropuerto={setAeroModal}
                  totalEnviosGlobal={resultado.totalEnviosCargados}
                  fechaInicioRaw={fechaInicioRaw}
                />
              )}
              {activeTab === 'simulacion' && (
                <SimulacionPanel
                  simDia={simDia}
                  simTiempoMinutos={simTiempoMinutos}
                  fechaInicioRaw={fechaInicioRaw}
                  isPlaying={isPlaying}
                  rangoFinalizado={rangoFinalizado}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onStop={handleStop}
                  onReiniciar={handleReiniciar}
                  umbralVerde={umbralVerde}
                  umbralAmbar={umbralAmbar}
                  onUmbralVerde={handleUmbralVerde}
                  onUmbralAmbar={handleUmbralAmbar}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── MAPA (flex-1) ── */}
        <main className="flex-1 relative flex overflow-hidden">
          {/* Mapa */}
          <div className="flex-1 relative min-h-0">
            <MapaRutas
              resultado={resultado}
              simDia={simDia}
              simTiempoMinutos={simTiempoMinutos}
              onSelectVuelo={setVueloModal}
              selectedVuelo={vueloModal}
              umbralVerde={umbralVerde}
              umbralAmbar={umbralAmbar}
              modoMapa={modoMapa}
              onModoMapa={setModoMapa}
            />

            {/* Overlay de Tiempo en el Mapa */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-[#0c1a30]/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-3 shadow-lg pointer-events-none flex gap-6 items-center">
              
              <div className="text-left">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  Periodo de Simulación
                </p>
                <p className="text-xs font-medium text-slate-300 capitalize">
                  {formatRawDateToShort(fechaInicioRaw)} <span className="text-slate-500 mx-1">→</span> {formatRawDateToShort(fechaFinRaw)}
                </p>
              </div>

              <div className="w-px h-8 bg-slate-700/50"></div>

              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  Tiempo Simulado
                </p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-xs text-slate-300 capitalize">
                    {formatFechaSimulacion(fechaInicioRaw, simDia)}
                  </span>
                  <span className="text-xl font-mono text-emerald-400 font-bold">
                    {formatoHora(simTiempoMinutos)}
                  </span>
                </div>
              </div>
              
              <div className="w-px h-8 bg-slate-700/50"></div>
              
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  Tiempo Reproducción
                </p>
                <p className="text-xl font-mono text-blue-400 font-bold">
                  {formatTiempoPlayback(playbackSeconds)}
                </p>
              </div>
            </div>

            {/* Overlay de Logs Temporales */}
            {logMsg && (
              <div className="absolute bottom-6 right-6 z-[600] bg-emerald-600/90 text-white px-4 py-3 rounded-lg shadow-xl shadow-emerald-900/50 backdrop-blur border border-emerald-400/50 flex items-center gap-2 fade-in-up">
                <span className="text-xl">✅</span>
                <span className="font-medium text-sm">{logMsg}</span>
              </div>
            )}

            {/* Botón toggle panel de resultados */}
            <button
              onClick={() => setPanelResultOpen(p => !p)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-[500]
                         w-6 h-16 bg-[#0c1a30] border border-slate-700/50 border-r-0
                         rounded-l-lg flex items-center justify-center
                         text-slate-400 hover:text-slate-200 hover:bg-slate-700/50
                         transition-all text-xs"
              aria-label="Toggle panel de resultados"
            >
              {panelResultOpen ? '›' : '‹'}
            </button>
          </div>

          {/* ── PANEL RESULTADOS (derecha, colapsable) ── */}
          <div
            className={`overflow-hidden shrink-0 border-slate-700/50 bg-[#0c1a30] flex flex-col transition-all duration-300 ease-in-out
                       ${panelResultOpen ? 'w-[720px] max-w-[55vw] border-l' : 'w-0 border-l-0'}`}
          >
            <div className="w-[720px] max-w-[55vw] h-full overflow-y-auto custom-scrollbar">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    📊 Panel de Resultados
                  </p>
                </div>
                <ResultadosPanel
                  resultadoSA={resultado.resultadoSA || null}
                  resultadoALNS={resultado.resultadoALNS || null}
                  escenario={resultado.escenario}
                  totalVuelos={resultado.totalVuelos}
                  totalEnvios={resultado.totalEnviosCargados}
                  aeropuertos={resultado.aeropuertos}
                  fechaInicioRaw={fechaInicioRaw}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── MODALS ── */}
      <ModalEnvio envio={envioModal} onClose={() => setEnvioModal(null)} />
      <ModalAeropuerto
        aeropuerto={aeroModal}
        rutasActivas={rutasActivas}
        simTiempoMinutos={simTiempoMinutos}
        onClose={() => setAeroModal(null)}
      />
      <ModalVuelo
        vuelo={vueloModal}
        rutasActivas={rutasActivas}
        onClose={() => setVueloModal(null)}
        fechaInicioRaw={fechaInicioRaw}
      />
    </div>
  );
}
