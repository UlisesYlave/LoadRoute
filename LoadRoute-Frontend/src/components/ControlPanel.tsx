'use client';

import React, { useState, useRef, useCallback } from 'react';
import { ejecutarSimulacion } from '@/services/ruteoService';
import { RutaResponse, SimulacionJob } from '@/types/rutas';

interface ControlPanelProps {
  onResultado: (resultado: RutaResponse[]) => void;
  onError: (error: string) => void;
  onCargando: (cargando: boolean) => void;
  onFechaInicio?: (fecha: string) => void;
  onProgressJob?: (job: SimulacionJob) => void;
}

interface FileState {
  files: File[];
  name: string;
}

const ESCENARIOS = [
  {
    id: 1,
    titulo: 'Simulación de Periodo',
    subtitulo: 'Sin interrupciones — SA vs ALNS',
    descripcion: 'Simulación completa del periodo sin cancelaciones. SA y ALNS compiten en condiciones ideales para establecer el baseline de rendimiento.',
    icono: '📊',
    color: 'cyan',
  },
  {
    id: 2,
    titulo: 'Operación Día a Día',
    subtitulo: 'Baja interrupción — SA vs ALNS',
    descripcion: 'Operación real con cancelación leve (~1% de vuelos/día). SA y ALNS replanifican diariamente. El estado de la red evoluciona progresivamente.',
    icono: '⚡',
    color: 'blue',
  },
  {
    id: 3,
    titulo: 'Operación de Colapso',
    subtitulo: 'Cancelación agresiva — SA vs ALNS',
    descripcion: 'Cancelación acumulativa del 5% de vuelos por día. SA y ALNS deben replanificar bajo estrés progresivo hasta alcanzar el punto de colapso.',
    icono: '🔄',
    color: 'amber',
  },
];

const FILE_CONFIGS = [
  { key: 'aeropuertos', label: 'Aeropuertos', desc: 'Archivo de husos horarios', icon: '🏢', accept: '.txt' },
  { key: 'vuelos', label: 'Planes de Vuelo', desc: 'planes_vuelo.txt', icon: '✈️', accept: '.txt' },
  { key: 'envios', label: 'Envíos', desc: '_envios_XXXX_.txt', icon: '📦', accept: '.txt' },
];

/** Convierte 'YYYY-MM-DD' (HTML date input) a 'YYYYMMDD' (backend) */
function toBackendDate(htmlDate: string): string {
  return htmlDate.replace(/-/g, '');
}

export default function ControlPanel({ onResultado, onError, onCargando, onFechaInicio, onProgressJob }: ControlPanelProps) {
  const [archivos, setArchivos] = useState<Record<string, FileState>>({
    aeropuertos: { files: [], name: '' },
    vuelos: { files: [], name: '' },
    envios: { files: [], name: '' },
  });
  const [escenario, setEscenario] = useState(1);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState<SimulacionJob | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileChange = useCallback((key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setArchivos(prev => ({ ...prev, [key]: { files: [], name: '' } }));
      return;
    }
    const filesArray = Array.from(fileList);
    const textFiles = key === 'envios'
      ? filesArray.filter(f => /_envios_[A-Za-z]{4}_\.txt/i.test(f.name))
      : filesArray;
    const name = textFiles.length > 1 ? `${textFiles.length} archivos cargados` : (textFiles[0]?.name || '');
    setArchivos(prev => ({ ...prev, [key]: { files: textFiles, name } }));
  }, []);

  const handleFechaInicioChange = (val: string) => {
    setFechaInicio(val);
    if (onFechaInicio) onFechaInicio(val ? toBackendDate(val) : '');
  };

  const todosArchivosListos = archivos.aeropuertos.files.length > 0 &&
    archivos.vuelos.files.length > 0 &&
    archivos.envios.files.length > 0;

  const handleEjecutar = async () => {
    if (!todosArchivosListos) return;
    setEjecutando(true);
    onCargando(true);
    onError('');
    setProgreso({ jobId: '', status: 'PENDING', progress: 0, message: 'Preparando simulacion...' });
    try {
      const resultado = await ejecutarSimulacion(
        archivos.aeropuertos.files[0],
        archivos.vuelos.files[0],
        archivos.envios.files,
        escenario,
        fechaInicio ? toBackendDate(fechaInicio) : undefined,
        fechaFin    ? toBackendDate(fechaFin)    : undefined,
        (job) => {
          setProgreso(job);
          if (onProgressJob) onProgressJob(job);
        }
      );
      onResultado(resultado);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      onError(msg);
    } finally {
      setEjecutando(false);
      onCargando(false);
      setProgreso(null);
    }
  };

  const colorMap: Record<string, string> = {
    blue:  'border-blue-500/40 bg-blue-500/10 text-blue-400',
    cyan:  'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  };
  const colorMapActive: Record<string, string> = {
    blue:  'border-blue-400 bg-blue-500/20 ring-1 ring-blue-400/30',
    cyan:  'border-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/30',
    amber: 'border-amber-400 bg-amber-500/20 ring-1 ring-amber-400/30',
  };

  return (
    <div className="space-y-5">
      {/* Archivos de datos */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Carga de Datos
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {FILE_CONFIGS.map(cfg => {
            const state = archivos[cfg.key];
            const hasFile = state.files.length > 0;
            return (
              <div
                key={cfg.key}
                onClick={() => fileRefs.current[cfg.key]?.click()}
                className={`relative cursor-pointer rounded-lg border-2 border-dashed p-4 transition-all duration-200
                  ${hasFile
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-slate-600/50 bg-slate-800/30 hover:border-blue-500/40 hover:bg-blue-500/5'
                  }`}
              >
                <input
                  ref={el => { fileRefs.current[cfg.key] = el; }}
                  type="file"
                  accept={cfg.accept}
                  onChange={(e) => handleFileChange(cfg.key, e)}
                  multiple={cfg.key === 'envios'}
                  {...(cfg.key === 'envios' ? { webkitdirectory: '' } : {})}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{hasFile ? '✅' : cfg.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">{cfg.label}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {hasFile ? state.name : cfg.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtro de fechas */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span>📅</span> Filtro de Fechas
          <span className="text-slate-600 font-normal normal-case tracking-normal">(opcional)</span>
        </h3>
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Fecha Inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => handleFechaInicioChange(e.target.value)}
              className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200
                         focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20
                         [color-scheme:dark] transition-all"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Fecha Fin</label>
            <input
              type="date"
              value={fechaFin}
              min={fechaInicio}
              onChange={e => setFechaFin(e.target.value)}
              className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200
                         focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20
                         [color-scheme:dark] transition-all"
            />
          </div>
          {!fechaInicio && (
            <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
              <span>⚠️</span> Sin fechas: procesa todos los envíos (puede ser lento)
            </p>
          )}
        </div>
      </div>

      {/* Tipo de Simulación */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Tipo de Simulación
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {ESCENARIOS.map(esc => {
            const isActive = escenario === esc.id;
            return (
              <button
                key={esc.id}
                onClick={() => setEscenario(esc.id)}
                className={`text-left rounded-lg border p-4 transition-all duration-200
                  ${isActive ? colorMapActive[esc.color] : colorMap[esc.color]}
                  hover:scale-[1.01]`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl mt-0.5">{esc.icono}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{esc.titulo}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{esc.subtitulo}</p>
                    {isActive && (
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">{esc.descripcion}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Botón Ejecutar */}
      <button
        onClick={handleEjecutar}
        disabled={!todosArchivosListos || ejecutando}
        className={`w-full py-3.5 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2
          ${todosArchivosListos && !ejecutando
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30'
            : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          }`}
      >
        {ejecutando ? (
          <>
            <div className="w-4 h-4 border-2 border-transparent border-t-white rounded-full animate-spin" />
            Ejecutando simulación...
          </>
        ) : (
          <>
            <span>▶</span>
            Ejecutar Simulación — Escenario {escenario}
          </>
        )}
      </button>

      {progreso && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-blue-100 truncate">{progreso.message}</span>
            <span className="font-mono text-blue-300">{progreso.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-300"
              style={{ width: `${progreso.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
