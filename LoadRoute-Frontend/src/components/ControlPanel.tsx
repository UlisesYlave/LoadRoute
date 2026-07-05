'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ejecutarSimulacion } from '@/services/ruteoService';
import { RutaResponse, SimulacionJob } from '@/types/rutas';
import {
  IconChart, IconBolt, IconRefresh, IconBuilding, IconPlane, IconPackage,
  IconClock, IconWarning, IconCheck, IconFolder, IconCalendar
} from '@/components/icons';

interface ControlPanelProps {
  escenario: number;
  setEscenario: (escenario: number) => void;
  onResultado: (resultado: RutaResponse[]) => void;
  onError: (error: string) => void;
  onCargando: (cargando: boolean) => void;
  onFechaInicio?: (fecha: string) => void;
  onFechaFin?: (fecha: string) => void;
  onProgressJob?: (job: SimulacionJob) => void;
  getAbortSignal?: () => AbortSignal;
}

interface FileState {
  files: File[];
  name: string;
}


const ESCENARIOS = [
  {
    id: 1,
    titulo: 'Simulación de Periodo',
    descripcion: 'Simulación con data histórica para un periodo definido.',
    icono: <IconChart size={18} />,
    color: 'cyan',
  },
  {
    id: 2,
    titulo: 'Operación Día a Día',
    descripcion: 'Operación diaria con llegada de envíos y vuelos en tiempo real.',
    icono: <IconBolt size={18} />,
    color: 'blue',
  },
  {
    id: 3,
    titulo: 'Operación de Colapso',
    descripcion: 'Simulación que funciona hasta que el sistema entra en colapso.',
    icono: <IconRefresh size={18} />,
    color: 'amber',
  },
];

const FILE_CONFIGS = [
  { key: 'aeropuertos', label: 'Aeropuertos', desc: 'Husos horarios (.txt)', icon: <IconBuilding size={18} />, accept: '.txt' },
  { key: 'vuelos',      label: 'Planes de Vuelo', desc: 'planes_vuelo.txt',  icon: <IconPlane size={18} />, accept: '.txt' },
  { key: 'envios',      label: 'Envíos', desc: '_envios_XXXX_.txt',          icon: <IconPackage size={18} />, accept: '.txt' },
];

const MODOS_PERIODO = [
  { id: 'semanal', label: 'Semanal', dias: 7 },
  { id: 'cinco',   label: '5 días',  dias: 5 },
  { id: 'tres',    label: '3 días',  dias: 3 },
] as const;

type ModoPeriodo = typeof MODOS_PERIODO[number]['id'];

function toBackendDate(htmlDate: string): string {
  return htmlDate.replace(/-/g, '');
}

function toBackendDateTime(htmlDate: string, htmlTime: string): string {
  return `${toBackendDate(htmlDate)}${(htmlTime || '00:00').replace(':', '')}`;
}

function todayAsHtmlDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Formatters
function formatHtmlDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatHtmlTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function calcularFinPeriodo(fechaInicio: string, horaInicio: string, dias: number): Date | null {
  if (!fechaInicio) return null;
  const inicio = new Date(`${fechaInicio}T${horaInicio || '00:00'}`);
  if (Number.isNaN(inicio.getTime())) return null;
  return addDays(inicio, dias);
}

function toBackendDateTimeFromDate(date: Date): string {
  return `${toBackendDate(formatHtmlDate(date))}${formatHtmlTime(date).replace(':', '')}`;
}

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

export default function ControlPanel({ escenario, setEscenario, onResultado, onError, onCargando, onFechaInicio, onFechaFin, onProgressJob, getAbortSignal }: ControlPanelProps) {
  const [archivos, setArchivos] = useState<Record<string, FileState>>({
    aeropuertos: { files: [], name: '' },
    vuelos:      { files: [], name: '' },
    envios:      { files: [], name: '' },
  });
  const [modoPeriodo,            setModoPeriodo]            = useState<ModoPeriodo>('semanal');
  const [fechaInicio,            setFechaInicio]            = useState('');
  const [horaInicio,             setHoraInicio]             = useState('00:00');
  const [ejecutando,             setEjecutando]             = useState(false);
  const [progreso,               setProgreso]               = useState<SimulacionJob | null>(null);
  const [cargaDatosAbierta,      setCargaDatosAbierta]      = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const configArchivos = useMemo(() => {
    if (escenario === 2) {
      return FILE_CONFIGS.filter(cfg => cfg.key === 'envios');
    }
    return FILE_CONFIGS;
  }, [escenario]);

  const archivosCargados = useMemo(() => {
    return configArchivos.filter(cfg => archivos[cfg.key].files.length > 0).length;
  }, [configArchivos, archivos]);

  const labelCargaArchivos = useMemo(() => {
    if (escenario === 2) {
      return archivos.envios.files.length > 0 ? 'Archivo de envíos cargado' : 'Subir archivo de envíos';
    }
    return archivosCargados > 0 ? `${archivosCargados} de 3 tipos cargados` : 'Aeropuertos, planes de vuelo y envíos';
  }, [escenario, archivosCargados, archivos.envios.files.length]);

  const periodoSeleccionado = useMemo(
    () => MODOS_PERIODO.find(modo => modo.id === modoPeriodo) || MODOS_PERIODO[0],
    [modoPeriodo]
  );

  const fechaFinCalculada = useMemo(
    () => calcularFinPeriodo(fechaInicio, horaInicio, periodoSeleccionado.dias),
    [fechaInicio, horaInicio, periodoSeleccionado.dias]
  );
  const fechaInicioBackend = fechaInicio ? toBackendDateTime(fechaInicio, horaInicio) : undefined;
  const fechaFinBackend = escenario === 1 && fechaFinCalculada ? toBackendDateTimeFromDate(fechaFinCalculada) : undefined;
  const esSimulacionPeriodo = escenario === 1 || escenario === 3; // Solo Escenario 1 y 3 requieren periodo definido
  const inicioPeriodoValido = !esSimulacionPeriodo || Boolean(fechaInicio);

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
    const name = textFiles.length > 1 ? `${textFiles.length} archivos` : (textFiles[0]?.name || '');
    setArchivos(prev => ({ ...prev, [key]: { files: textFiles, name } }));
  }, []);

  const handleFechaInicioChange = (val: string) => {
    setFechaInicio(val);
    if (onFechaInicio) onFechaInicio(val ? toBackendDateTime(val, horaInicio) : '');
  };

  const handleHoraInicioChange = (val: string) => {
    setHoraInicio(val);
    if (onFechaInicio) onFechaInicio(fechaInicio ? toBackendDateTime(fechaInicio, val) : '');
  };

  const handleHoy = () => {
    const hoy = todayAsHtmlDate();
    handleFechaInicioChange(hoy);
  };

  const handleEjecutar = async () => {
    if (!inicioPeriodoValido) {
      onError('Selecciona la fecha y hora de inicio del periodo.');
      return;
    }
    setEjecutando(true);
    onCargando(true);
    onError('');
    onFechaInicio?.(esSimulacionPeriodo ? (fechaInicioBackend || '') : '');
    onFechaFin?.(esSimulacionPeriodo ? (fechaFinBackend || '') : '');
    setProgreso({ jobId: '', status: 'PENDING', progress: 0, message: 'Preparando simulacion...' });
    try {
      const signal = getAbortSignal?.();
      const resultado = await ejecutarSimulacion(
        archivos.aeropuertos.files[0],
        archivos.vuelos.files[0],
        archivos.envios.files,
        escenario,
        esSimulacionPeriodo ? fechaInicioBackend : undefined,
        escenario === 1 ? fechaFinBackend : undefined,
        'sa',
        undefined,
        undefined,
        (job) => {
          setProgreso(job);
          if (onProgressJob) onProgressJob(job);
        },
        signal
      );
      onResultado(resultado);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      if (msg !== 'Simulación cancelada por el usuario') {
        onError(msg);
      }
    } finally {
      setEjecutando(false);
      onCargando(false);
      setProgreso(null);
    }
  };

  return (
    <div className="space-y-5">

      {/* ── 1. Tipo de Simulación (arriba) ── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Tipo de Simulación
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {ESCENARIOS.map(esc => {
            const isActive = escenario === esc.id;
            return (
              <button
                key={esc.id}
                onClick={() => {
                  setEscenario(esc.id);
                }}
                className={`text-left rounded-lg border p-3 transition-all duration-200 hover:scale-[1.02]
                  ${isActive ? colorMapActive[esc.color] : colorMap[esc.color]}`}
              >
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 opacity-90">{esc.icono}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 leading-tight">{esc.titulo}</p>
                  </div>
                </div>
                {isActive && (
                  <p className="text-[10px] text-slate-300 mt-2 leading-relaxed border-t border-slate-700/50 pt-2">
                    {esc.descripcion}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Configuracion contextual ── */}
      <div className={esSimulacionPeriodo ? 'grid grid-cols-2 gap-4' : 'space-y-3'}>

        {/* Columna izquierda: Archivos */}
        <div>
          <button
            type="button"
            onClick={() => setCargaDatosAbierta(open => !open)}
            className="w-full rounded-lg border border-slate-700/60 bg-slate-800/35 px-3 py-2.5 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/5"
            aria-expanded={cargaDatosAbierta}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <IconFolder size={15} /> Carga de Datos
                  <span className="text-slate-600 font-normal normal-case tracking-normal text-[10px] ml-1">(opcional)</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {labelCargaArchivos}
                </p>
              </div>
              <span className={`text-slate-400 transition-transform ${cargaDatosAbierta ? 'rotate-180' : ''}`} aria-hidden>
                ▾
              </span>
            </div>
          </button>

          {cargaDatosAbierta && (
            <div className="mt-2 space-y-2">
              {configArchivos.map(cfg => {
                const state = archivos[cfg.key];
                const hasFile = state.files.length > 0;
                return (
                  <div
                    key={cfg.key}
                    onClick={() => fileRefs.current[cfg.key]?.click()}
                    className={`relative cursor-pointer rounded-lg border-2 border-dashed px-3 py-2.5 transition-all duration-200
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
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">{hasFile ? <IconCheck size={18} className="text-emerald-400" /> : cfg.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-200 leading-tight">{cfg.label}</p>
                        <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                          {hasFile ? state.name : cfg.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna derecha: Fechas + Hora + Duración */}
        {esSimulacionPeriodo && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <IconCalendar size={15} /> CONFIGURACIÓN
          </h3>

          {/* 🌟 CONDICIONAL: Botones de Periodo solo en Escenario 1 */}
          {escenario === 1 && (
          <div className="grid grid-cols-3 gap-1.5">
            {MODOS_PERIODO.map(modo => {
              const isActive = modoPeriodo === modo.id;
                return (
                  <button
                    key={modo.id}
                    type="button"
                    onClick={() => setModoPeriodo(modo.id)}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition-all
                      ${isActive
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/20'
                        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
                      }`}
                  >
                    {modo.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fecha + Hora Inicio */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Inicio</label>
              <button
                type="button"
                onClick={handleHoy}
                className="text-[10px] text-blue-400/80 hover:text-blue-300 transition-colors px-1.5 py-0.5 rounded border border-blue-500/20 hover:border-blue-400/40"
              >
                Hoy
              </button>
            </div>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => handleFechaInicioChange(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200
                         focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20
                         [color-scheme:dark] transition-all"
            />
            <input
              type="time"
              value={horaInicio}
              onChange={e => handleHoraInicioChange(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200
                         focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20
                         [color-scheme:dark] transition-all"
            />
          </div>
          {escenario === 1 && (
            <p className={`text-[10px] flex items-center gap-1.5 px-1 ${fechaInicio ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
              {fechaInicio ? <IconClock size={14} className="shrink-0" /> : <IconWarning size={14} className="shrink-0" />}
              <span>{fechaInicio ? `Duración: ${periodoSeleccionado.dias} días` : 'Selecciona inicio para calcular el periodo'}</span>
            </p>
          )}
        </div>
        )}
      </div>

      {/* ── 3. Botón Ejecutar ── */}
      <button
        onClick={handleEjecutar}
        disabled={ejecutando || !inicioPeriodoValido}
        className={`w-full py-3.5 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2
          ${!ejecutando && inicioPeriodoValido
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
            Iniciar
          </>
        )}
      </button>

      {progreso && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-blue-100 truncate">{progreso.message}</span>
            <span className="font-mono text-blue-300 shrink-0">{progreso.progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
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
