'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import ControlPanel from '@/components/ControlPanel';
import SidebarInfo from '@/components/SidebarInfo';
import ModalEnvio from '@/components/ModalEnvio';
import ModalAeropuerto from '@/components/ModalAeropuerto';
import ModalVuelo from '@/components/ModalVuelo';
import { RutaResponse, RutaMuestra, AeropuertoDTO, TramoDTO } from '@/types/rutas';
import { verificarSaludBackend } from '@/services/ruteoService';
import ResultadosPanel from '@/components/ResultadosPanel';

const MapaRutas = dynamic(() => import('@/components/MapaRutas'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full rounded-lg bg-[#0f1f3d]/50 border border-slate-700/50">
      <div className="text-4xl mb-3 animate-spin">🗺️</div>
      <p className="text-slate-400 text-sm">Cargando mapa...</p>
    </div>
  ),
});

export default function Home() {
  const [resultado, setResultado] = useState<RutaResponse | null>(null);
  const [error, setError] = useState('');
  const [backendActivo, setBackendActivo] = useState<boolean | null>(null);
  const [cargando, setCargando] = useState(false);

  // Modals state
  const [envioModal, setEnvioModal] = useState<RutaMuestra | null>(null);
  const [aeroModal, setAeroModal] = useState<AeropuertoDTO | null>(null);
  const [vueloModal, setVueloModal] = useState<TramoDTO | null>(null);

  // Simulation Time state
  const [simTiempoMinutos, setSimTiempoMinutos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    verificarSaludBackend().then(setBackendActivo);
  }, []);

  // Timer effect
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setSimTiempoMinutos(prev => (prev + 3) % 1440); // Avanza 3 min cada tick
      }, 50); // 50ms = 3min => 1 hora por segundo
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  const formatoHora = (minutos: number) => {
    const h = Math.floor(minutos / 60);
    const m = Math.floor(minutos % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} GMT`;
  };

  const handleReiniciar = () => {
    setResultado(null);
    setIsPlaying(false);
    setSimTiempoMinutos(0);
  };

  // ====== VISTA DE CARGA DE DATOS ======
  if (!resultado) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full bg-[#0c1a30] border border-slate-700/40 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/logo.png" alt="LoadRoute Logo" className="h-24 mb-4" />
            <p className="text-slate-400 text-sm mt-2">Cargue los datos maestros para inicializar el Dashboard de Simulación</p>
          </div>
          <ControlPanel
            onResultado={(res) => {
              setResultado(res);
              setIsPlaying(true); // Iniciar auto
            }}
            onError={setError}
            onCargando={setCargando}
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
            <div className={`text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${backendActivo ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${backendActivo ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              Backend: {backendActivo ? 'Conectado' : 'Offline'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====== VISTA DASHBOARD ======
  return (
    <div className="h-screen bg-[#0a1628] flex flex-col overflow-hidden text-slate-200">
      {/* HEADER CONTROLS */}
      <header className="bg-[#0f1f3d] border-b border-slate-700/50 p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="LoadRoute Logo" className="h-10 mb-4" />
        </div>

        {/* Central Controls */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 p-1.5 rounded-lg">
            <button
              onClick={() => setIsPlaying(true)}
              disabled={isPlaying}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${isPlaying ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              Iniciar
            </button>
            <button
              onClick={() => setIsPlaying(false)}
              disabled={!isPlaying}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${!isPlaying ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              Pausar
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setSimTiempoMinutos(0);
              }}
              className="px-4 py-1.5 rounded-md text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-all"
            >
              Detener
            </button>
          </div>

          <div className="text-center bg-slate-900 border border-slate-700 rounded-lg px-6 py-2 shadow-inner mr-4">
            <span className="text-2xl font-mono text-emerald-400 tracking-wider font-bold">
              {formatoHora(simTiempoMinutos)}
            </span>
          </div>

          {/* Ocupación Legend */}
          <div className="flex items-center gap-4 bg-[#0c1a30]/80 border border-slate-700/50 px-5 py-2.5 rounded-xl text-xs uppercase tracking-tight">
            <span className="text-slate-300 font-bold mr-1">Capacidad:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-slate-200">0-30%</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-700/50 pl-4">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <span className="text-slate-200">31-70%</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-700/50 pl-4">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              <span className="text-slate-200">71-100%</span>
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={handleReiniciar}
            className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded border border-slate-600 text-slate-300 transition-all"
          >
            Cargar Otros Datos
          </button>
        </div>
      </header>

      {/* MAIN BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="w-80 border-r border-slate-700/50 bg-[#0c1a30] flex flex-col shrink-0">
          <SidebarInfo
            envios={resultado?.resultadoALNS?.rutasMuestra || resultado?.resultadoSA?.rutasMuestra || []}
            aeropuertos={resultado.aeropuertos}
            onSelectEnvio={setEnvioModal}
            onSelectAeropuerto={setAeroModal}
          />
        </aside>

        {/* MAIN / MAPA + PANEL RESULTADOS */}
        <main className="flex-1 relative border-l border-slate-800 flex flex-col bg-slate-900">

          <div className="flex-1 relative min-h-0">
            <MapaRutas
              resultado={resultado}
              simTiempoMinutos={simTiempoMinutos}
              onSelectVuelo={setVueloModal}
            />
          </div>

          {/* Restaurando el Panel de Resultados */}
          <div className="h-64 border-t border-slate-700 bg-[#0c1a30] shrink-0 overflow-y-auto w-full">
            <div className="p-4 w-full h-full">
              <ResultadosPanel
                resultadoSA={resultado.resultadoSA || null}
                resultadoALNS={resultado.resultadoALNS || null}
                escenario={resultado.escenario}
                totalVuelos={resultado.totalVuelos}
                totalEnvios={resultado.totalEnviosCargados}
              />
            </div>
          </div>

          {/* Modals superimposed on Main */}
          <ModalEnvio envio={envioModal} onClose={() => setEnvioModal(null)} />
          <ModalAeropuerto
            aeropuerto={aeroModal}
            rutasActivas={resultado?.resultadoALNS?.rutasMuestra || resultado?.resultadoSA?.rutasMuestra || []}
            simTiempoMinutos={simTiempoMinutos}
            onClose={() => setAeroModal(null)}
          />
          <ModalVuelo
            vuelo={vueloModal}
            rutasActivas={resultado?.resultadoALNS?.rutasMuestra || resultado?.resultadoSA?.rutasMuestra || []}
            onClose={() => setVueloModal(null)}
          />
        </main>
      </div>
    </div>
  );
}
