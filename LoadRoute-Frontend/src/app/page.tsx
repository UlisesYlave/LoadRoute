'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ControlPanel from '@/components/ControlPanel';
import AdminPanel from '@/components/AdminPanel';
import { ColapsoDatos } from '@/components/ModalColapso';
import { RutaResponse, RutaMuestra, AeropuertoDTO, TramoDTO, FiltrosAvionesMapa } from '@/types/rutas';
import { verificarSaludBackend, cancelarVuelo as cancelarVueloApi, reactivarVuelo as reactivarVueloApi, obtenerVuelosCancelados, eliminarSimulacion } from '@/services/ruteoService';
import { calcularUltimasCargasAeropuertos, calcularCargaAeropuertoActual } from '@/utils/capacidad';
import { IconSettings } from '@/components/icons';
import { useSimulationTimer } from '@/hooks/useSimulationTimer';
import { DashboardView } from '@/components/DashboardView';

// ── Tipos de tabs ──
type TabId = 'pedidos' | 'aeropuertos' | 'simulacion' | 'pantalla' | 'vuelos' | 'resultados' | 'administracion';

const FILTROS_AVIONES_INICIALES: FiltrosAvionesMapa = {
  usarOrigen: false,
  usarDestino: false,
  origenes: [],
  destinos: [],
  ocultarVacios: true,
};

function getPanelWidth(tab: TabId | null): string {
  if (!tab) return '0px';
  if (tab === 'administracion' || tab === 'resultados') return '520px';
  return '320px';
}

// ── Helper: tiempo transcurrido legible ──
function formatTiempoTranscurrido(minutos: number): string {
  const m    = Math.floor(minutos);
  const dias  = Math.floor(m / 1440);
  const horas = Math.floor((m % 1440) / 60);
  const mins  = m % 60;
  if (dias > 0)  return `${dias}d ${horas}h ${mins}m`;
  if (horas > 0) return `${horas}h ${mins}m`;
  return `${mins}m`;
}

// ── Helper: tiempo real transcurrido legible ──
function formatTiempoReal(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${tenths}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

function getDayOffset(fechaInicioRaw: string, fechaStr: string): number {
  if (!fechaInicioRaw || !fechaStr) return -1;
  const y1 = parseInt(fechaInicioRaw.slice(0, 4));
  const m1 = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d1 = parseInt(fechaInicioRaw.slice(6, 8));
  const start = new Date(y1, m1, d1);
  
  const [y2, m2, d2] = fechaStr.split('-').map(Number);
  const current = new Date(y2, m2 - 1, d2);
  
  const diffTime = Math.abs(current.getTime() - start.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// ── Helper: fecha de simulación ──
function formatFechaSimulacion(fechaInicioRaw: string, simDia: number): string {
  if (!fechaInicioRaw || fechaInicioRaw.length < 8) return `Día ${simDia + 1}`;
  const y = parseInt(fechaInicioRaw.slice(0, 4));
  const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d = parseInt(fechaInicioRaw.slice(6, 8));
  const base = new Date(y, m, d);
  base.setDate(base.getDate() + simDia);
  return base.toLocaleDateString('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function aplicarFechasSimulacion(
  res: RutaResponse,
  setInicio: (v: string) => void,
  setFin: (v: string) => void,
  fechaInicioUsuario?: string,
  fechaFinUsuario?: string,
) {
  const inicio = (fechaInicioUsuario && fechaInicioUsuario.length >= 12) ? fechaInicioUsuario : (res.fechaInicio || fechaInicioUsuario || '');
  const fin = (fechaFinUsuario && fechaFinUsuario.length >= 12) ? fechaFinUsuario : (res.fechaFin || fechaFinUsuario || '');
  setInicio(inicio);
  setFin(fin);
}

function formatoHora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const mn = Math.floor(minutos % 60);
  return `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')} GMT`;
}

function combineChunks(chunks: RutaResponse[] | undefined): RutaResponse | null {
  if (!chunks || chunks.length === 0) return null;
  const base = { ...chunks[0] };
  base.chunksCount = chunks.length;
  base.resultadoSA = base.resultadoSA ? { ...base.resultadoSA, rutasMuestra: [...(base.resultadoSA.rutasMuestra || [])] } : null;
  base.totalEnviosCargados = chunks.reduce((total, c) => total + (c.totalEnviosCargados || 0), 0);

  base.cancelacionesPorDiaSA = [];

  const rutasMap = new Map<string, any>();
  if (base.resultadoSA) {
    for (const r of (base.resultadoSA.rutasMuestra || [])) {
      rutasMap.set(r.envioId, r);
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (base.resultadoSA && c.resultadoSA) {
      base.cancelacionesPorDiaSA.push(c.resultadoSA.vuelosCanceladosIds || []);
    }
    if (i === 0) continue;
    base.fechaFin = c.fechaFin;
    base.loteFin  = c.loteFin || base.loteFin;
    if (base.resultadoSA && c.resultadoSA) {
      base.resultadoSA.costoInicial      += c.resultadoSA.costoInicial;
      base.resultadoSA.costoFinal        += c.resultadoSA.costoFinal;
      base.resultadoSA.tiempoEjecucionMs += c.resultadoSA.tiempoEjecucionMs;
      base.resultadoSA.enviosAsignados   += c.resultadoSA.enviosAsignados;
      base.resultadoSA.enviosNoAceptados  = (base.resultadoSA.enviosNoAceptados || 0) + (c.resultadoSA.enviosNoAceptados || 0);
      base.resultadoSA.totalEnvios       += c.resultadoSA.totalEnvios;
      for (const r of (c.resultadoSA.rutasMuestra || [])) {
        rutasMap.set(r.envioId, r);
      }
      
      if (base.resultadoSA.costoInicial > 0) {
        base.resultadoSA.mejoraRelativa = ((base.resultadoSA.costoInicial - base.resultadoSA.costoFinal) / base.resultadoSA.costoInicial) * 100;
      }
    }
  }

  if (base.resultadoSA) {
    base.resultadoSA.rutasMuestra = Array.from(rutasMap.values());
  }

  return base;
}

// ════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════
export default function Home() {
  // 1. Estados base del negocio
  const [resultado, setResultado] = useState<RutaResponse | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [escenario, setEscenario] = useState(1);

  // 2. Modals y Layout
  const [envioModal, setEnvioModal] = useState<RutaMuestra | null>(null);
  const [aeroModal, setAeroModal] = useState<AeropuertoDTO | null>(null);
  const [vueloModal, setVueloModal] = useState<TramoDTO | null>(null);
  const [colapsoDatos, setColapsoDatos] = useState<ColapsoDatos | null>(null);
  const colapsoDetectadoRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const filtrosAvionesInicializadosRef = useRef(false);

  // 3. Estados crudos de fechas que ingresa el usuario o vienen del backend
  const [fechaInicioRaw, setFechaInicioRaw] = useState('');
  const [fechaFinRaw, setFechaFinRaw] = useState('');
  const fechaInicioUsuarioRef = useRef('');
  const fechaFinUsuarioRef = useRef('');
  const isFirstChunkRef = useRef(true);
  const activeJobIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [jobOwner, setJobOwner] = useState<string | null>(null);

  const getAbortSignal = () => {
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }
    return abortControllerRef.current.signal;
  };

  // 4. Umbrales de capacidad (Se quedan en la página porque los controla el Sidebar)
  const [umbralVerde, setUmbralVerde] = useState(30);
  const [umbralAmbar, setUmbralAmbar] = useState(70);
  
  // 🌟 5. LA ÚNICA LÍNEA DEL RELOJ QUE NECESITAS 🌟
  // Extraemos todo lo necesario del hook pasándole las dependencias que pide.
  const {
    simTotalMinutos,
    simTotalVisual,
    realElapsedMs,
    isPlaying,
    horaReal,
    simDia,
    simHoraMinutos,
    simTranscurridoMinutos,
    progresoSimulacion,
    rangoFinalizado,
    maxSimDia,
    maxTotalMinutos,
    setIsPlaying,
    handleStop,
    resetTimerCompletamente,
  } = useSimulationTimer({ resultado, fechaInicioRaw, fechaFinRaw });

  const diasSimulados = maxSimDia !== null ? maxSimDia + 1 : 0;

  const rutasActivas = useMemo(
    () => resultado?.resultadoSA?.rutasMuestra || [],
    [resultado?.resultadoSA?.rutasMuestra]
  );
  const rutasParaCargaFinal = useMemo(() => {
    if (!resultado) return [];
    return resultado.resultadoSA?.rutasMuestra || [];
  }, [resultado]);
  const cargasAeropuertoFinales = useMemo(
    () => rangoFinalizado ? calcularUltimasCargasAeropuertos(rutasParaCargaFinal) : null,
    [rangoFinalizado, rutasParaCargaFinal]
  );

  // ── Indicadores globales (almacenes) ──
  const globalStatsAeropuertos = useMemo(() => {
    if (!resultado) return null;
    let totalCarga    = 0;
    let totalCapacidad = 0;
    for (const a of resultado.aeropuertos) {
      const carga = cargasAeropuertoFinales?.[a.codigo]
        ?? calcularCargaAeropuertoActual(a.codigo, rutasActivas, simTotalVisual);
      totalCarga    += carga;
      totalCapacidad += a.capacidadMax;
    }
    return { carga: totalCarga, capacidad: totalCapacidad };
  }, [resultado, cargasAeropuertoFinales, rutasActivas, simTotalVisual]);

  const [cancelacionesBD, setCancelacionesBD] = useState<{ id: number; vueloId: number; fecha: string }[]>([]);

  const cargarCancelacionesBD = useCallback(async () => {
    try {
      const activeEscenario = resultado?.escenario ?? escenario;
      const list = await obtenerVuelosCancelados(activeEscenario);
      setCancelacionesBD(list);
    } catch (e) {
      console.error("Error al cargar cancelaciones de BD", e);
    }
  }, [resultado?.escenario, escenario]);

  useEffect(() => {
    // Verificar salud del backend al iniciar
    verificarSaludBackend();
    cargarCancelacionesBD();
  }, [cargarCancelacionesBD]);

  const [filtrosAvionesMapa, setFiltrosAvionesMapa] = useState<FiltrosAvionesMapa>(FILTROS_AVIONES_INICIALES);
  const [cancelacionesLocales, setCancelacionesLocales] = useState<Record<number, number[]>>({});
  const [filtroSemaforoVuelos, setFiltroSemaforoVuelos] = useState<'todos' | 'verde' | 'ambar' | 'rojo'>('todos');
  const [filtroSemaforoAero, setFiltroSemaforoAero] = useState<'todos' | 'verde' | 'ambar' | 'rojo'>('todos');

  const cancelacionesBDMap = useMemo(() => {
    const map: Record<number, number[]> = {};
    if (!fechaInicioRaw) return map;
    
    cancelacionesBD.forEach(c => {
      const dayOffset = getDayOffset(fechaInicioRaw, c.fecha);
      if (dayOffset >= 0) {
        if (!map[dayOffset]) map[dayOffset] = [];
        if (!map[dayOffset].includes(c.vueloId)) {
          map[dayOffset].push(c.vueloId);
        }
      }
    });
    return map;
  }, [cancelacionesBD, fechaInicioRaw]);

  const cancelacionesPorDiaCombinadas = useMemo(() => {
    const isEscenario2 = resultado?.escenario === 2;
    const base = isEscenario2 ? [] : (resultado?.cancelacionesPorDiaSA || []);
    const merged = [...base];
    
    const addIdsToDay = (day: number, ids: number[]) => {
      while (merged.length <= day) {
        merged.push([]);
      }
      ids.forEach(id => {
        if (!merged[day].includes(id)) {
          merged[day] = [...merged[day], id];
        }
      });
    };

    Object.entries(cancelacionesBDMap).forEach(([dayStr, ids]) => {
      addIdsToDay(parseInt(dayStr), ids);
    });
    
    Object.entries(cancelacionesLocales).forEach(([dayStr, ids]) => {
      addIdsToDay(parseInt(dayStr), ids);
    });
    
    return merged;
  }, [resultado?.escenario, resultado?.cancelacionesPorDiaSA, cancelacionesBDMap, cancelacionesLocales]);

  const inicializarFiltrosAvionesMapa = useCallback(() => {
    if (filtrosAvionesInicializadosRef.current) return;
    filtrosAvionesInicializadosRef.current = true;
    setFiltrosAvionesMapa(FILTROS_AVIONES_INICIALES);
  }, []);

  const handleFechaInicioPanel = useCallback((fecha: string) => {
    fechaInicioUsuarioRef.current = fecha;
    setFechaInicioRaw(fecha);
  }, []);

  const handleFechaFinPanel = useCallback((fecha: string) => {
    fechaFinUsuarioRef.current = fecha;
    setFechaFinRaw(fecha);
  }, []);

  const handleCancelarVuelo = useCallback(async (vueloId: number, fecha: string) => {
    await cancelarVueloApi(vueloId, fecha, resultado?.escenario);
    await cargarCancelacionesBD();
    
    if (fechaInicioRaw) {
      const y1 = parseInt(fechaInicioRaw.slice(0, 4));
      const m1 = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
      const d1 = parseInt(fechaInicioRaw.slice(6, 8));
      const start = new Date(y1, m1, d1);
      
      const [y2, m2, d2] = fecha.split('-').map(Number);
      const current = new Date(y2, m2 - 1, d2);
      
      const diffTime = Math.abs(current.getTime() - start.getTime());
      const dayOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      setCancelacionesLocales(prev => {
        const next = { ...prev };
        if (!next[dayOffset]) next[dayOffset] = [];
        if (!next[dayOffset].includes(vueloId)) {
          next[dayOffset] = [...next[dayOffset], vueloId];
        }
        return next;
      });
    }
  }, [fechaInicioRaw, cargarCancelacionesBD]);

  const handleReactivarVuelo = useCallback(async (vueloId: number, fecha: string) => {
    await reactivarVueloApi(vueloId, fecha, resultado?.escenario);
    await cargarCancelacionesBD();
    
    if (fechaInicioRaw) {
      const y1 = parseInt(fechaInicioRaw.slice(0, 4));
      const m1 = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
      const d1 = parseInt(fechaInicioRaw.slice(6, 8));
      const start = new Date(y1, m1, d1);
      
      const [y2, m2, d2] = fecha.split('-').map(Number);
      const current = new Date(y2, m2 - 1, d2);
      
      const diffTime = Math.abs(current.getTime() - start.getTime());
      const dayOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      setCancelacionesLocales(prev => {
        const next = { ...prev };
        if (next[dayOffset]) {
          next[dayOffset] = next[dayOffset].filter(id => id !== vueloId);
        }
        return next;
      });
    }
  }, [fechaInicioRaw, cargarCancelacionesBD]);

  // ── Detección de colapso (Escenario 3) ──────────────────────────────────
  // Función auxiliar: calcula cargas de aeropuertos en el minuto actual usando
  // el mismo índice usado por el mapa (re-implementado localmente para evitar importar
  // la función interna de MapaRutas).
  const detectarColapsoEnMinuto = useCallback(
    (minutoActual: number, res: RutaResponse): ColapsoDatos | null => {
      if (!res || res.escenario !== 3) return null;

      const rutas = res.resultadoSA?.rutasMuestra || [];
      const aeropuertos = res.aeropuertos || [];

      // 1. Verificar envíos no asignados (SLA incumplido): envíos sin tramos
      const enviosNoAsignados = rutas.filter(r => !r.tramos || r.tramos.length === 0);
      if (enviosNoAsignados.length > 0) {
        const primero = enviosNoAsignados[0];
        return {
          razon: `No fue posible realizar el SLA del envío ${primero.envioId} (${primero.origen} → ${primero.destino}, ${primero.maletas} maletas). El sistema no encontró rutas viables dentro del tiempo límite.`,
          lugar: `${primero.origen} → ${primero.destino}`,
          momentoSimulacion: minutoActual,
          fechaInicioRaw: res.fechaInicio || '',
          tipoColapso: 'sla',
        };
      }

      // 2. Verificar aeropuertos llenos (≥ 100% capacidad)
      for (const aeropuerto of aeropuertos) {
        if (aeropuerto.capacidadMax <= 0) continue;
        const cargaActual = calcularCargaAeropuertoActual(aeropuerto.codigo, rutas, minutoActual);
        if (cargaActual >= aeropuerto.capacidadMax) {
          const pct = Math.round((cargaActual / aeropuerto.capacidadMax) * 100);
          return {
            razon: `El aeropuerto ${aeropuerto.codigo} (${aeropuerto.ciudad}, ${aeropuerto.pais}) ha superado su capacidad máxima de almacenamiento. Carga actual: ${cargaActual} / ${aeropuerto.capacidadMax} maletas (${pct}%).`,
            lugar: `${aeropuerto.codigo} — ${aeropuerto.ciudad}`,
            momentoSimulacion: minutoActual,
            fechaInicioRaw: res.fechaInicio || '',
            tipoColapso: 'aeropuerto',
          };
        }
      }

      // 3. Verificar aviones llenos (≥ 100% capacidad de vuelo)
      // Calculamos carga por vuelo activo en el minuto actual
      const cargaPorVuelo: Record<string, number> = {};
      for (const ruta of rutas) {
        if (!ruta.tramos) continue;
        for (const tramo of ruta.tramos) {
          const key = `${tramo.vueloId}-${tramo.diaOffset}`;
          cargaPorVuelo[key] = (cargaPorVuelo[key] || 0) + ruta.maletas;
        }
      }

      for (const ruta of rutas) {
        if (!ruta.tramos) continue;
        for (const tramo of ruta.tramos) {
          if (tramo.capacidad <= 0) continue;
          const key = `${tramo.vueloId}-${tramo.diaOffset}`;
          const carga = cargaPorVuelo[key] || 0;
          if (carga > tramo.capacidad) {
            const pct = Math.round((carga / tramo.capacidad) * 100);
            return {
              razon: `El vuelo #${tramo.vueloId} (${tramo.origen} → ${tramo.destino}) ha superado su capacidad máxima de carga. Maletas asignadas: ${carga} / ${tramo.capacidad} (${pct}%).`,
              lugar: `Vuelo #${tramo.vueloId} — ${tramo.origen} → ${tramo.destino}`,
              momentoSimulacion: minutoActual,
              fechaInicioRaw: res.fechaInicio || '',
              tipoColapso: 'avion',
            };
          }
        }
      }

      // 4. Verificar mensaje de colapso del backend
      if (res.resultadoSA?.mensajeColapso) {
        return {
          razon: res.resultadoSA.mensajeColapso,
          lugar: 'Red de distribución',
          momentoSimulacion: minutoActual,
          fechaInicioRaw: res.fechaInicio || '',
          tipoColapso: 'general',
        };
      }

      return null;
    },
    []
  );

  // ── Monitoreo de colapso en Escenario 3 ──────────────────────────────────
  useEffect(() => {
    if (!resultado || resultado.escenario !== 3 || !isPlaying) return;
    if (colapsoDetectadoRef.current) return;

    const colapso = detectarColapsoEnMinuto(simTotalMinutos, resultado);
    if (colapso) {
      colapsoDetectadoRef.current = true;
      setIsPlaying(false);
      setColapsoDatos(colapso);
    }
  }, [simTotalMinutos, resultado, isPlaying, detectarColapsoEnMinuto, setIsPlaying]);

  // Acciones adaptadas usando los métodos del Custom Hook
  const handleReiniciar = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeJobIdRef.current) {
      if (resultado?.escenario !== 2) {
        eliminarSimulacion(activeJobIdRef.current).catch(() => undefined);
      }
      activeJobIdRef.current = null;
    }
    setJobOwner(null);
    setResultado(null);
    resetTimerCompletamente(0); // <-- Limpia el estado del tiempo del hook
    setFechaInicioRaw('');
    setFechaFinRaw('');
    fechaInicioUsuarioRef.current = '';
    fechaFinUsuarioRef.current = '';
    isFirstChunkRef.current = true;
    filtrosAvionesInicializadosRef.current = false;
    setFiltrosAvionesMapa(FILTROS_AVIONES_INICIALES);
    setColapsoDatos(null);
    colapsoDetectadoRef.current = false;
    setCancelacionesLocales({});
    setCancelacionesBD([]);
    setFiltroSemaforoVuelos('todos');
    setFiltroSemaforoAero('todos');
  };

  const handleSimulationStopped = (message: string) => {
    handleReiniciar();
    setError(message);
  };

  const handleTabClick = useCallback((id: TabId) => {
    setActiveTab(prev => {
      const next = prev === id ? null : id;
      if (next) {
        setVueloModal(null);
        setAeroModal(null);
        setEnvioModal(null);
      }
      return next;
    });
  }, []);

  const handleSelectVuelo = useCallback((vuelo: TramoDTO) => {
    setActiveTab(null);
    setAeroModal(null);
    setEnvioModal(null);
    setVueloModal(vuelo);
  }, []);

  const handleSelectAeropuerto = useCallback((aeropuerto: AeropuertoDTO) => {
    setActiveTab(null);
    setVueloModal(null);
    setEnvioModal(null);
    setAeroModal(aeropuerto);
  }, []);

  const handleSelectEnvio = useCallback((envio: RutaMuestra) => {
    setVueloModal(null);
    setAeroModal(null);
    setEnvioModal(envio);
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
  if (showAdmin) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col justify-center p-6">
        <div className="max-w-4xl w-full mx-auto bg-[#0c1a30] border border-slate-700/40 rounded-xl flex flex-col h-[85vh] shadow-2xl overflow-hidden">
          <div className="px-6 py-4 bg-[#0f1f3d] border-b border-slate-700/50 flex items-center justify-between shrink-0">
            <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Mantenimiento de Maestros y Envíos
            </span>
            <button
              onClick={() => setShowAdmin(false)}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Regresar al Inicio
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AdminPanel escenario={escenario} />
          </div>
        </div>
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full bg-[#0c1a30] border border-slate-700/40 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/logo.png" alt="LoadRoute Logo" className="h-24 mb-4" />
          </div>
          <ControlPanel
            escenario={escenario}
            setEscenario={setEscenario}
            getAbortSignal={getAbortSignal}
            onResultado={(resChunks) => {
              const res = combineChunks(resChunks);
              if (res) {
                colapsoDetectadoRef.current = false;
                setColapsoDatos(null);
                setCancelacionesLocales({});
                setResultado(res);
                inicializarFiltrosAvionesMapa();
                aplicarFechasSimulacion(res, setFechaInicioRaw, setFechaFinRaw, fechaInicioUsuarioRef.current, fechaFinUsuarioRef.current);
                if (isFirstChunkRef.current) {
                  isFirstChunkRef.current = false;
                  setIsPlaying(true);
                }
              }
            }}
            onProgressJob={(job) => {
              activeJobIdRef.current = job.jobId;
              setJobOwner(job.owner || null);
              const res = combineChunks(job.chunks);
              if (res) {
                if (isFirstChunkRef.current) {
                  isFirstChunkRef.current = false;
                  colapsoDetectadoRef.current = false;
                  setColapsoDatos(null);
                  setResultado(res);
                  inicializarFiltrosAvionesMapa();
                  aplicarFechasSimulacion(res, setFechaInicioRaw, setFechaFinRaw, fechaInicioUsuarioRef.current, fechaFinUsuarioRef.current);
                  setIsPlaying(true);
                } else {
                  setResultado(res);
                  aplicarFechasSimulacion(res, setFechaInicioRaw, setFechaFinRaw, fechaInicioUsuarioRef.current, fechaFinUsuarioRef.current);
                }
              }
            }}
            onError={setError}
            onCargando={setCargando}
            onFechaInicio={handleFechaInicioPanel}
            onFechaFin={handleFechaFinPanel}
            onSimulationStopped={handleSimulationStopped}
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

          <div className="mt-6 pt-4 border-t border-slate-800/60 flex justify-center">
            <button
              onClick={() => setShowAdmin(true)}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1.5"
            >
              <IconSettings size={14} /> Mantenimiento de Maestros y Envíos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // VISTA DASHBOARD
  // ══════════════════════════════════════════════
  return (
    <DashboardView
      resultado={resultado}
      fechaInicioRaw={fechaInicioRaw}
      simDia={simDia}
      simHoraMinutos={simHoraMinutos}
      simTranscurridoMinutos={simTranscurridoMinutos}
      realElapsedMs={realElapsedMs}
      progresoSimulacion={progresoSimulacion}
      maxTotalMinutos={maxTotalMinutos}
      rangoFinalizado={rangoFinalizado}
      isPlaying={isPlaying}
      horaReal={horaReal}
      activeTab={activeTab}
      simTotalVisual={simTotalVisual}
      cargasAeropuertoFinales={cargasAeropuertoFinales}
      vueloModal={vueloModal}
      envioModal={envioModal}
      aeroModal={aeroModal}
      colapsoDatos={colapsoDatos}
      umbralVerde={umbralVerde}
      umbralAmbar={umbralAmbar}
      filtrosAvionesMapa={filtrosAvionesMapa}
      globalStatsAeropuertos={globalStatsAeropuertos}
      rutasActivas={rutasActivas}
      diasSimulados={diasSimulados}
      maxSimDia={maxSimDia}
      jobOwner={jobOwner}
      
      // Filtros semáforo
      filtroSemaforoVuelos={filtroSemaforoVuelos}
      setFiltroSemaforoVuelos={setFiltroSemaforoVuelos}
      filtroSemaforoAero={filtroSemaforoAero}
      setFiltroSemaforoAero={setFiltroSemaforoAero}
      
      // Cancelaciones
      cancelacionesPorDia={cancelacionesPorDiaCombinadas}
      simTotalMinutos={simTotalMinutos}
      onCancelarVuelo={handleCancelarVuelo}
      onReactivarVuelo={handleReactivarVuelo}
      
      // Funciones / Handlers
      setIsPlaying={setIsPlaying}
      handleStop={handleStop}
      handleTabClick={handleTabClick}
      handleSelectVuelo={handleSelectVuelo}
      handleSelectAeropuerto={handleSelectAeropuerto}
      handleSelectEnvio={handleSelectEnvio}
      getPanelWidth={getPanelWidth}
      setActiveTab={setActiveTab}
      setEnvioModal={setEnvioModal}
      setAeroModal={setAeroModal}
      setVueloModal={setVueloModal}
      setColapsoDatos={setColapsoDatos}
      handleUmbralVerde={handleUmbralVerde}
      handleUmbralAmbar={handleUmbralAmbar}
      handleReiniciar={handleReiniciar}
      setFiltrosAvionesMapa={setFiltrosAvionesMapa}
      
      // Formateadores
      formatFechaSimulacion={formatFechaSimulacion}
      formatoHora={formatoHora}
      formatTiempoTranscurrido={formatTiempoTranscurrido}
      formatTiempoReal={formatTiempoReal}
    />
  );
}
