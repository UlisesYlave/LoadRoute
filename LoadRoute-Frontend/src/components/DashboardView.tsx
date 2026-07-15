import React, { ReactNode, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

import SidebarInfo from './SidebarInfo';
import SimulacionPanel from './SimulacionPanel'; 
import SidebarFiltroMapa from './SidebarFiltroMapa';
import SidebarVuelos from './SidebarVuelos';
import AdminPanel from './AdminPanel';
import ResultadosPanel from './ResultadosPanel';
import ModalEnvio from './Modals/ModalEnvio';
import ModalAeropuerto from './Modals/ModalAeropuerto';
import ModalVuelo from './Modals/ModalVuelo';
import ModalColapso from './Modals/ModalColapso';
import ModalReporteFinal from './Modals/ModalReporteFinal';

import { obtenerUbicacionActualPedido } from '@/utils/pedidoHelpers';
import { formatFechaSimulacion, resolverFechaInicioRaw } from '@/utils/fechaSimulacion';

import {
  IconPackage, IconBuilding, IconSettings, IconScreen, IconPlane, IconClipboard,
  IconPlay, IconPause, IconStop, IconClose, IconChart, IconMap,
  IconWarehouse, IconCheck,
} from '@/components/icons';

const MapaRutas = dynamic(() => import('@/components/MapaRutas'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full rounded-lg bg-[#0f1f3d]/50 border border-slate-700/50">
      <IconMap className="mb-3 text-cyan-400/60 animate-pulse" size={40} />
      <p className="text-slate-400 text-sm">Cargando mapa...</p>
    </div>
  ),
});

type TabId = 'pedidos' | 'aeropuertos' | 'simulacion' | 'pantalla' | 'vuelos' | 'resultados' | 'administracion';

const NAV_TABS: { id: TabId; icon: ReactNode; label: string; color: string }[] = [
  { id: 'aeropuertos',    icon: <IconBuilding size={20} />,   label: 'Aeropuertos', color: 'emerald' },
  { id: 'vuelos',         icon: <IconPlane size={20} />,      label: 'Vuelos',      color: 'orange'  },
  { id: 'pedidos',        icon: <IconPackage size={20} />,    label: 'Pedidos',     color: 'blue'    },
  { id: 'simulacion',     icon: <IconSettings size={20} />,   label: 'Simulación',  color: 'violet'  },
  { id: 'pantalla',       icon: <IconScreen size={20} />,     label: 'Pantalla',    color: 'cyan'    },
  { id: 'resultados',     icon: <IconChart size={20} />,      label: 'Resultados',  color: 'indigo'  },
  { id: 'administracion', icon: <IconClipboard size={20} />,  label: 'Maestros',    color: 'rose'    },
];

interface DashboardViewProps {
  resultado: any; 
  fechaInicioRaw: string;
  simDia: number;
  simHoraMinutos: number;
  simTranscurridoMinutos: number;
  realElapsedMs: number;
  progresoSimulacion: number;
  maxTotalMinutos: number | null;
  rangoFinalizado: boolean;
  isPlaying: boolean;
  horaReal: Date;
  activeTab: TabId | null;
  simTotalVisual: number;
  cargasAeropuertoFinales: any;
  vueloModal: any;
  envioModal: any;
  aeroModal: any;
  colapsoDatos: any;
  umbralVerde: number;
  umbralAmbar: number;
  filtrosAvionesMapa: any;
  globalStatsAeropuertos: any;
  rutasActivas: any[];
  diasSimulados: number;
  maxSimDia: number | null;
  jobOwner?: string | null;

  setIsPlaying: (play: boolean) => void;
  handleStop: () => void;
  handleTabClick: (tabId: TabId) => void;
  handleSelectVuelo: (vuelo: any) => void;
  handleSelectAeropuerto: (aeropuerto: any) => void;
  handleSelectEnvio: (envio: any) => void;
  getPanelWidth: (tab: TabId | null) => string;
  setActiveTab: (tab: TabId | null) => void;
  setEnvioModal: (modal: any) => void;
  setAeroModal: (modal: any) => void;
  setVueloModal: (modal: any) => void;
  setColapsoDatos: (modal: any) => void;
  handleUmbralVerde: (val: number) => void;
  handleUmbralAmbar: (val: number) => void;
  handleReiniciar: () => void;
  setFiltrosAvionesMapa: (filtros: any) => void;

  formatoHora: (minutos: number) => string;
  formatTiempoTranscurrido: (minutos: number) => string;
  formatTiempoReal: (ms: number) => string;
  
  cancelacionesPorDia: number[][];
  simTotalMinutos: number;
  onCancelarVuelo: (vueloId: number, fecha: string) => Promise<void>;
  onReactivarVuelo: (vueloId: number, fecha: string) => Promise<void>;

  filtroSemaforoVuelos: 'todos' | 'verde' | 'ambar' | 'rojo';
  setFiltroSemaforoVuelos: (f: 'todos' | 'verde' | 'ambar' | 'rojo') => void;
  filtroSemaforoAero: 'todos' | 'verde' | 'ambar' | 'rojo';
  setFiltroSemaforoAero: (f: 'todos' | 'verde' | 'ambar' | 'rojo') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  resultado,
  fechaInicioRaw,
  simDia,
  simHoraMinutos,
  simTranscurridoMinutos,
  realElapsedMs,
  progresoSimulacion,
  maxTotalMinutos,
  rangoFinalizado,
  isPlaying,
  horaReal,
  activeTab,
  simTotalVisual,
  cargasAeropuertoFinales,
  vueloModal,
  envioModal,
  aeroModal,
  colapsoDatos,
  umbralVerde,
  umbralAmbar,
  filtrosAvionesMapa,
  globalStatsAeropuertos,
  rutasActivas,
  diasSimulados,
  maxSimDia,
  jobOwner,
  setIsPlaying,
  handleStop,
  handleTabClick,
  handleSelectVuelo,
  handleSelectAeropuerto,
  handleSelectEnvio,
  getPanelWidth,
  setActiveTab,
  setEnvioModal,
  setAeroModal,
  setVueloModal,
  setColapsoDatos,
  handleUmbralVerde,
  handleUmbralAmbar,
  handleReiniciar,
  setFiltrosAvionesMapa,
  formatoHora,
  formatTiempoTranscurrido,
  formatTiempoReal,
  cancelacionesPorDia,
  simTotalMinutos,
  onCancelarVuelo,
  onReactivarVuelo,
  filtroSemaforoVuelos,
  setFiltroSemaforoVuelos,
  filtroSemaforoAero,
  setFiltroSemaforoAero,
}) => {
  // ── MATRIZ DE CONFIGURACIÓN POR ESCENARIO ──
  const escenario = resultado?.escenario ?? 1;

  const mostrarControlesYTranscurrido = escenario === 1 || escenario === 3;
  const mostrarProgreso = escenario === 1; 

  const [showReporteModal, setShowReporteModal] = useState(false);
  
  const [aeropuertoAEnfocar, setAeropuertoAEnfocar] = useState<any | null>(null);
  const [vueloAEnfocar, setVueloAEnfocar] = useState<any | null>(null);

  

  // ── CÁLCULO DE OCUPACIÓN DE FLOTA ACTIVA (EN VUELO) ──
  const statsFlotaActiva = useMemo(() => {
    const vuelosMaestros = resultado?.vuelosMaestros || [];
    if (vuelosMaestros.length === 0 || !rutasActivas) {
      return { pct: 0, carga: 0, capacidad: 0, vuelosActivos: 0 };
    }

    // 1. Calcular la carga de cada vuelo maestro por día
    const cargaPorVuelo: Record<string, number> = {};
    for (const ruta of rutasActivas) {
      if (!ruta.tramos) continue;
      const vuelosRuta = new Set<string>();
      for (const tramo of ruta.tramos) {
        const key = `${tramo.vueloId}-${tramo.diaOffset}`;
        if (vuelosRuta.has(key)) continue;
        vuelosRuta.add(key);
        cargaPorVuelo[key] = (cargaPorVuelo[key] || 0) + ruta.maletas;
      }
    }

    // 2. Determinar qué vuelos están en el aire en simTotalVisual
    let totalCarga = 0;
    let totalCapacidad = 0;
    let vuelosActivos = 0;

    const tramosVistos = new Set<string>();
    for (const ruta of rutasActivas) {
      if (!ruta.tramos) continue;
      for (const t of ruta.tramos) {
        const key = `${t.vueloId}-${t.diaOffset}`;
        if (tramosVistos.has(key)) continue;
        
        // Verificar si está volando
        const salidaLeg = (t.diaOffset ?? 0) * 1440 + t.salidaMinutosGMT;
        let llegadaLeg = (t.diaOffset ?? 0) * 1440 + t.llegadaMinutosGMT;
        if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
          llegadaLeg += 1440;
        }

        if (simTotalVisual >= salidaLeg && simTotalVisual <= llegadaLeg) {
          tramosVistos.add(key);
          const carga = cargaPorVuelo[key] || 0;
          totalCarga += carga;
          totalCapacidad += t.capacidad;
          vuelosActivos++;
        }
      }
    }

    // También verificamos si hay vuelos vacíos en el aire
    const simDia = Math.floor(simTotalVisual / 1440);
    const diasAChequear = [simDia];
    if (simDia > 0) diasAChequear.push(simDia - 1);

    for (const v of vuelosMaestros) {
      for (const d of diasAChequear) {
        const key = `${v.vueloId}-${d}`;
        if (tramosVistos.has(key)) continue; // Ya contado

        // Verificar si está volando
        const salidaLeg = d * 1440 + v.salidaMinutosGMT;
        let llegadaLeg = d * 1440 + v.llegadaMinutosGMT;
        if (v.llegadaMinutosGMT < v.salidaMinutosGMT) {
          llegadaLeg += 1440;
        }

        // Si este vuelo está cancelado hoy, no vuela
        const listCancelaciones = cancelacionesPorDia || resultado?.cancelacionesPorDiaSA;
        const canceladosHoy = listCancelaciones?.[d] || [];
        if (canceladosHoy.includes(v.vueloId)) {
          continue;
        }

        if (simTotalVisual >= salidaLeg && simTotalVisual <= llegadaLeg) {
          tramosVistos.add(key);
          totalCapacidad += v.capacidad;
          vuelosActivos++;
        }
      }
    }

    const pct = totalCapacidad > 0 ? (totalCarga / totalCapacidad) * 100 : 0;
    return { pct, carga: totalCarga, capacidad: totalCapacidad, vuelosActivos };
  }, [resultado, rutasActivas, simTotalVisual, cancelacionesPorDia]);

  const fechaInicioEfectiva = useMemo(
    () => resolverFechaInicioRaw(fechaInicioRaw, resultado?.fechaInicio, resultado?.loteInicio),
    [fechaInicioRaw, resultado?.fechaInicio, resultado?.loteInicio],
  );

  const fechaSimulacionFormateada = useMemo(
    () => formatFechaSimulacion(fechaInicioEfectiva, simTotalVisual),
    [fechaInicioEfectiva, simTotalVisual],
  );

  // ── CÁLCULO DE OCUPACIÓN GLOBAL DE ALMACENES ──
  const statsAlmacenes = useMemo(() => {
    if (!globalStatsAeropuertos) {
      return { pct: 0, carga: 0, capacidad: 0 };
    }
    const { carga, capacidad } = globalStatsAeropuertos;
    const pct = capacidad > 0 ? (carga / capacidad) * 100 : 0;
    return { pct, carga, capacidad };
  }, [globalStatsAeropuertos]);

  // Abrir reporte automáticamente cuando la simulación termina
  useEffect(() => {
    if (mostrarProgreso && rangoFinalizado) {
      setShowReporteModal(true);
    }
  }, [rangoFinalizado, mostrarProgreso]);

  // ── FUNCIÓN CENTRALIZADA PARA ENFOCAR PEDIDOS ──
  const handleEnfocarPedido = (pedido: any) => {
    if (!pedido) return;

    const vuelosMaestros = resultado?.vuelosMaestros || [];

    // 1. Calcular el estado del envío para saber qué enfocar
    let estado = 'No ruteado';
    if (pedido.tramos && pedido.tramos.length > 0) {
      const receiptTime = (pedido.recepcionDiaOffset ?? 0) * 1440 + (pedido.recepcionMinutosGMT ?? 0);
      const lastTramo = pedido.tramos[pedido.tramos.length - 1];
      let llegadaLast = (lastTramo.diaOffset ?? 0) * 1440 + lastTramo.llegadaMinutosGMT;
      if (lastTramo.llegadaMinutosGMT < lastTramo.salidaMinutosGMT) {
        llegadaLast += 1440;
      }

      if (simTotalVisual < receiptTime) {
        estado = 'No recibido';
      } else if (simTotalVisual >= llegadaLast) {
        estado = 'Entregado';
      } else {
        // Verificar si está volando
        let estaVolando = false;
        for (const t of pedido.tramos) {
          const salidaLeg = (t.diaOffset ?? 0) * 1440 + t.salidaMinutosGMT;
          let llegadaLeg = (t.diaOffset ?? 0) * 1440 + t.llegadaMinutosGMT;
          if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
            llegadaLeg += 1440;
          }
          if (simTotalVisual >= salidaLeg && simTotalVisual <= llegadaLeg) {
            estaVolando = true;
            break;
          }
        }

        if (estaVolando) {
          estado = 'En vuelo';
        } else {
          // Si no está volando, ver si ya despegó del origen
          const firstLeg = pedido.tramos[0];
          const departureFirst = (firstLeg.diaOffset ?? 0) * 1440 + firstLeg.salidaMinutosGMT;
          if (simTotalVisual < departureFirst) {
            estado = 'Esperando';
          } else {
            estado = 'Esperando escala';
          }
        }
      }
    }

    console.log("=== ENFOQUE DE PEDIDO ===");
    console.log("Estado calculado del pedido:", estado);

    // 2. Ejecutar la acción según el estado
    if (estado === 'En vuelo') {
      const tramoActual = pedido.tramos?.find((t: any) => {
        const salidaLeg = (t.diaOffset ?? 0) * 1440 + t.salidaMinutosGMT;
        let llegadaLeg = (t.diaOffset ?? 0) * 1440 + t.llegadaMinutosGMT;
        if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
          llegadaLeg += 1440;
        }
        return simTotalVisual >= salidaLeg && simTotalVisual <= llegadaLeg;
      });

      if (tramoActual) {
        const vueloCompleto = vuelosMaestros.find(
          (v: any) => String(v.vueloId) === String(tramoActual.vueloId)
        );

        const vueloASeleccionar = vueloCompleto ? { ...vueloCompleto, diaOffset: tramoActual.diaOffset } : tramoActual;
        
        setAeropuertoAEnfocar(null);
        setVueloAEnfocar(vueloASeleccionar);
        // handleSelectVuelo(vueloASeleccionar); // Keep shipment modal open & route visible
      }
    } else if (estado === 'Entregado' || estado === 'Esperando' || estado === 'Esperando escala') {
      let codigoAero = pedido.origen;
      
      if (estado === 'Entregado') {
        codigoAero = pedido.destino;
      } else if (estado === 'Esperando escala') {
        for (let i = 0; i < pedido.tramos.length - 1; i++) {
          const currentLeg = pedido.tramos[i];
          const nextLeg = pedido.tramos[i + 1];

          let arrivalCurrent = (currentLeg.diaOffset ?? 0) * 1440 + currentLeg.llegadaMinutosGMT;
          if (currentLeg.llegadaMinutosGMT < currentLeg.salidaMinutosGMT) {
            arrivalCurrent += 1440;
          }

          const departureNext = (nextLeg.diaOffset ?? 0) * 1440 + nextLeg.salidaMinutosGMT;

          if (simTotalVisual >= arrivalCurrent && simTotalVisual < departureNext) {
            codigoAero = currentLeg.destino;
            break;
          }
        }
      }

      const aeropuertoObjeto = resultado?.aeropuertos?.find(
        (a: any) => a.codigo === codigoAero
      );

      if (aeropuertoObjeto) {
        setVueloAEnfocar(null);
        setAeropuertoAEnfocar(aeropuertoObjeto);
        // handleSelectAeropuerto(aeropuertoObjeto); // Keep shipment modal open & route visible
      }
    }
  };

  const labelEscenario = 
    escenario === 1 ? 'Simulación 5 días' : 
    escenario === 2 ? 'Operación' : 'Colapso';

  return (
    <div className="h-screen bg-[#0a1628] flex flex-col overflow-hidden text-slate-200">

      {/* ── HEADER ── */}
      <header className="bg-[#0f1f3d] border-b border-slate-700/50 px-4 py-0 flex items-center gap-3 shrink-0 h-14">
        {/* Logo */}
        <button 
          onClick={handleReiniciar}
          title="Volver a la pantalla de inicio"
          className="hover:opacity-80 transition-opacity flex items-center shrink-0 cursor-pointer"
        >
          <img src="/logo.png" alt="LoadRoute Logo" className="h-8 shrink-0" />
        </button>
        <div className="w-px h-6 bg-slate-700/60 shrink-0" />
        
        {/* Bloque de Escenario */}
        <div className="flex flex-col justify-center">
          <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Escenario</span>
          <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider">
            {labelEscenario}
          </span>
        </div>
        
        {/* Hora actual */}
        <div className="flex flex-col justify-center">
          <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Hora actual</span>
          <span className="text-sm font-mono text-slate-100 font-semibold leading-none">
            {horaReal.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div className="w-px h-6 bg-slate-700/60 shrink-0" />

        {/* Bloque de Tiempos dinámicos */}
        <div className="flex items-center gap-4 flex-1">

          {/* Fecha y hora de simulación (antes del reloj GMT) */}
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Fecha Sim.</span>
            <span className="text-md font-mono text-emerald-300 font-bold leading-none tracking-wider whitespace-nowrap">
              {fechaSimulacionFormateada}
            </span>
          </div>

          {/* Reloj GMT */}
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Hora GMT</span>
            <span className="text-md font-mono text-emerald-300 font-bold leading-none tracking-wider">
              {formatoHora(simHoraMinutos)}
            </span>
          </div>

          {/* Tiempo transcurrido */}
          {mostrarControlesYTranscurrido && (
            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Transcurrido</span>
              <span className="text-md font-mono text-indigo-200 font-semibold leading-none">
                {formatTiempoTranscurrido(simTranscurridoMinutos)}
              </span>
            </div>
          )}

          {/* Tiempo Real de Cómputo */}
          {escenario === 1 && (
            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wider leading-none mb-1">Tiempo Real</span>
              <span className="text-md font-mono text-cyan-300 font-bold leading-none">
                {formatTiempoReal(realElapsedMs)}
              </span>
            </div>
          )}

          {/* Barra de progreso */}
          {mostrarProgreso && maxTotalMinutos !== null && maxTotalMinutos > 0 && (
            <div className="flex flex-col justify-center w-20">
              <div className="flex justify-between text-[10px] font-bold text-cyan-100 mb-1">
                <span>Progreso</span>
                <span>{Math.round(progresoSimulacion * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${progresoSimulacion * 100}%` }}
                />
              </div>
            </div>
          )}

          {mostrarProgreso && rangoFinalizado && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 select-none">
                <IconCheck size={18} /> Finalizado
              </span>
              <button
                onClick={() => setShowReporteModal(true)}
                className="px-2.5 py-1 rounded bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-[10px] font-semibold transition-all flex items-center gap-1 shadow-sm"
              >
                <IconChart size={18} />
                Reporte
              </button>
            </div>
          )}

          {/* Controles multimedia Play/Pause/Stop */}
          {mostrarControlesYTranscurrido && (
            <div className="flex items-center gap-1 ml-2">
              <button
                id="btn-play"
                onClick={() => setIsPlaying(true)}
                disabled={isPlaying || (mostrarProgreso && rangoFinalizado)}
                title="Iniciar"
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                  ${isPlaying || (mostrarProgreso && rangoFinalizado)
                    ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300 ring-1 ring-emerald-500/30'}`}
              ><IconPlay size={14} /></button>
              <button
                id="btn-pause"
                onClick={() => setIsPlaying(false)}
                disabled={!isPlaying}
                title="Pausar"
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                  ${!isPlaying
                    ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                    : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300 ring-1 ring-amber-500/30'}`}
              ><IconPause size={14} /></button>
              <button
                id="btn-stop"
                onClick={handleStop}
                title="Detener y reiniciar"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                  bg-slate-800/50 text-slate-400 hover:bg-red-500/20 hover:text-red-400 ring-1 ring-slate-700/50"
              ><IconStop size={14} /></button>
            </div>
          )}
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── NAV STRIP ── */}
        <nav className="w-14 bg-[#0c1a30]/95 backdrop-blur-sm border-r border-slate-700/50 flex flex-col items-center py-4 gap-2 shrink-0 z-30">
          {NAV_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const activeColors: Record<string, string> = {
              blue:    'bg-blue-500/20 text-blue-400 shadow-blue-500/20',
              emerald: 'bg-emerald-500/20 text-emerald-400 shadow-emerald-500/20',
              violet:  'bg-violet-500/20 text-violet-400 shadow-violet-500/20',
              cyan:    'bg-cyan-500/20 text-cyan-300 shadow-cyan-500/20',
              orange:  'bg-orange-500/20 text-orange-400 shadow-orange-500/20',
              indigo:  'bg-indigo-500/20 text-indigo-300 shadow-indigo-500/20',
              rose:    'bg-rose-500/20 text-rose-400 shadow-rose-500/20',
            };
            return (
              <div key={tab.id} className="relative group">
                <button
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                    ${isActive
                      ? `${activeColors[tab.color]} shadow-lg ring-1 ring-current/20`
                      : 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/60'}`}
                  aria-label={tab.label}
                >
                  {tab.icon}
                </button>
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

        {/* ── MAPA ── */}
        <main className="flex-1 relative overflow-hidden">
          <MapaRutas
            resultado={resultado}
            simTiempoMinutos={simTotalVisual}
            onSelectVuelo={handleSelectVuelo}
            onSelectAeropuerto={handleSelectAeropuerto}
            selectedVuelo={vueloModal}
            vueloAEnfocar={vueloAEnfocar}
            aeropuertoAEnfocar={aeropuertoAEnfocar}
            umbralVerde={umbralVerde}
            umbralAmbar={umbralAmbar}
            modoMapa="sa"
            onModoMapa={() => {}}
            filtrosAviones={filtrosAvionesMapa}
            cancelacionesPorDia={cancelacionesPorDia}
            filtroSemaforoVuelos={filtroSemaforoVuelos}
            filtroSemaforoAero={filtroSemaforoAero}
            selectedEnvio={envioModal}
          />



          {/* PANEL LATERAL IZQUIERDO */}
          <div
            className="absolute top-0 left-0 h-full z-[1000] overflow-hidden pointer-events-none"
            style={{ width: getPanelWidth(activeTab), transition: 'width 0.25s ease' }}
          >
            <div className="pointer-events-auto h-full bg-[#0c1a30]/95 border-r border-slate-700/50 backdrop-blur-sm flex flex-col"
                 style={{ width: getPanelWidth(activeTab) }}>
              <div className="px-4 py-3 bg-[#0f1f3d]/80 border-b border-slate-700/50 shrink-0 flex items-center justify-between backdrop-blur-sm">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  {NAV_TABS.find(t => t.id === activeTab)?.label ?? ''}
                </span>
                <button
                  onClick={() => setActiveTab(null)}
                  className="text-slate-600 hover:text-slate-300 text-lg leading-none transition-colors"
                  aria-label="Cerrar panel"
                >
                  <IconClose size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {(activeTab === 'pedidos' || activeTab === 'aeropuertos') && (
                  <SidebarInfo
                    envios={rutasActivas}
                    aeropuertos={resultado.aeropuertos}
                    vuelos={resultado?.vuelosMaestros || []}
                    activeTab={activeTab}
                    simTiempoMinutos={simTotalVisual}
                    cargasAeropuertoOverride={cargasAeropuertoFinales}
                    onSelectEnvio={handleSelectEnvio}
                    onSelectAeropuerto={handleSelectAeropuerto}
                    umbralVerde={umbralVerde}
                    umbralAmbar={umbralAmbar}
                    filtroSemaforo={filtroSemaforoAero}
                    onChangeFiltroSemaforo={setFiltroSemaforoAero}
                  />
                )}
                {activeTab === 'simulacion' && (
                  <SimulacionPanel
                    umbralVerde={umbralVerde}
                    umbralAmbar={umbralAmbar}
                    onUmbralVerde={handleUmbralVerde}
                    onUmbralAmbar={handleUmbralAmbar}
                    onReiniciar={handleReiniciar}
                    escenario={resultado.escenario}
                    diasSimulados={diasSimulados}
                    realElapsedMs={realElapsedMs}
                    isOwner={typeof window !== 'undefined' ? (jobOwner === localStorage.getItem('sessionId')) : true}
                    statsFlotaActiva={statsFlotaActiva}
                    statsAlmacenes={statsAlmacenes}
                  />
                )}
                {activeTab === 'pantalla' && (
                  <SidebarFiltroMapa
                    aeropuertos={resultado.aeropuertos}
                    filtros={filtrosAvionesMapa}
                    onChange={setFiltrosAvionesMapa}
                  />
                )}
                 {activeTab === 'vuelos' && (
                  <SidebarVuelos
                    vuelos={resultado.vuelosMaestros || []}
                    cancelacionesPorDia={cancelacionesPorDia}
                    simDia={simDia}
                    maxDia={
                      resultado?.escenario === 2
                        ? Math.max(simDia + 2, 6)
                        : (diasSimulados > 0 ? diasSimulados - 1 : 0)
                    }
                    rutasActivas={rutasActivas}
                    umbralVerde={umbralVerde}
                    umbralAmbar={umbralAmbar}
                    onSelectVuelo={handleSelectVuelo} 
                    selectedVuelo={vueloModal} 
                    fechaInicioRaw={fechaInicioRaw}
                    aeropuertos={resultado.aeropuertos}
                    simTiempoMinutos={simTotalVisual}
                    filtroSemaforo={filtroSemaforoVuelos}
                    onChangeFiltroSemaforo={setFiltroSemaforoVuelos}
                  />
                )}
                {activeTab === 'administracion' && (
                  <AdminPanel
                    onSelectEnvio={(envioId: string) => {
                      const found = rutasActivas.find(r => r.envioId === envioId);
                      if (found) {
                        handleSelectEnvio(found);
                      } else {
                        alert("El envío aún no ha sido ruteado en la simulación activa.");
                      }
                    }}
                  />
                )}
                {activeTab === 'resultados' && (
                  <div className="h-full overflow-y-auto custom-scrollbar p-4">
                    <ResultadosPanel
                      resultadoSA={resultado.resultadoSA || null}
                      escenario={resultado.escenario}
                      totalVuelos={resultado.totalVuelos}
                      totalEnvios={resultado.totalEnviosCargados}
                      resultadoCompleto={resultado}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MODALS */}
      <ModalEnvio
        envio={envioModal}
        offsetRight={!!vueloModal || !!aeroModal || activeTab !== null}
        fechaInicioRaw={fechaInicioRaw}
        onClose={() => {
          setEnvioModal(null);
          setVueloAEnfocar(null);
          setAeropuertoAEnfocar(null);
        }}
        onEnfocarPedido={handleEnfocarPedido}
        simTiempoMinutos={simTotalVisual}
      />
      <ModalAeropuerto
        aeropuerto={aeroModal}
        rutasActivas={rutasActivas}
        simTiempoMinutos={simTotalVisual}
        cargasAeropuertoOverride={cargasAeropuertoFinales}
        onSelectEnvio={handleSelectEnvio}
        onClose={() => {
          setAeroModal(null);
          setAeropuertoAEnfocar(null);
        }}
        onEnfocarEnMapa={() => {
          if (aeroModal) {
            setAeropuertoAEnfocar(aeroModal);
          }
        }}
      />
      <ModalVuelo
        vuelo={vueloModal}
        rutasActivas={rutasActivas}
        cancelacionesPorDia={cancelacionesPorDia}
        simTotalMinutos={simTotalMinutos}
        fechaInicioRaw={fechaInicioRaw}
        onCancelarVuelo={onCancelarVuelo}
        onReactivarVuelo={onReactivarVuelo}
        onSelectEnvio={handleSelectEnvio}
        onClose={() => {
          setVueloModal(null)
          setVueloAEnfocar(null);
        }}
        aeropuertos={resultado.aeropuertos}
        escenario={resultado.escenario}
        onEnfocarEnMapa={() => {   
          if (vueloModal) {
            setVueloAEnfocar(vueloModal);
          }
        }}
      />
      <ModalColapso
        colapso={colapsoDatos}
        onClose={() => setColapsoDatos(null)}
      />
      <ModalReporteFinal
        isOpen={showReporteModal}
        onClose={() => setShowReporteModal(false)}
        resultadoCompleto={resultado}
      />
    </div>
  );
};
