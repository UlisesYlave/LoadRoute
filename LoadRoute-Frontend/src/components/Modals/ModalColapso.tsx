'use client';

import React from 'react';
import { 
  IconClose, 
  IconWarning, 
  IconBuilding, 
  IconPlane, 
  IconClock, 
  IconMapPin 
} from '@/components/icons';

export interface ColapsoDatos {
  razon: string;
  lugar: string;
  momentoSimulacion: number;      // minutos totales en la simulación
  fechaInicioRaw: string;          // para formatear la fecha
  tipoColapso: 'aeropuerto' | 'avion' | 'sla' | 'general';
}

interface ModalColapsoDatosProps {
  colapso: ColapsoDatos | null;
  onClose: () => void;
}

function formatMomentoColapso(momentoMinutos: number, fechaInicioRaw: string): string {
  const dia = Math.floor(momentoMinutos / 1440);
  const horaMin = momentoMinutos % 1440;
  const h = Math.floor(horaMin / 60);
  const m = Math.floor(horaMin % 60);
  const horaStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} GMT`;

  if (fechaInicioRaw && fechaInicioRaw.length >= 8) {
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const mo = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    const base = new Date(y, mo, d);
    base.setDate(base.getDate() + dia);
    const fechaStr = base.toLocaleDateString('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
    return `${fechaStr} — ${horaStr}`;
  }

  return `Día ${dia + 1} — ${horaStr}`;
}

function getTipoInfo(tipo: ColapsoDatos['tipoColapso']): {
  icon: React.ReactNode;
  label: string;
  badgeClass: string;
  iconClass: string;
} {
  switch (tipo) {
    case 'aeropuerto':
      return {
        icon: <IconBuilding size={20} className="text-orange-400" />,
        label: 'Aeropuerto lleno',
        badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
        iconClass: 'text-orange-400',
      };
    case 'avion':
      return {
        icon: <IconPlane size={20} className="text-amber-400" />,
        label: 'Avión lleno',
        badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        iconClass: 'text-amber-400',
      };
    case 'sla':
      return {
        icon: <IconClock size={20} className="text-red-400" />,
        label: 'SLA incumplido',
        badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30',
        iconClass: 'text-red-400',
      };
    default:
      return {
        icon: <IconWarning size={20} className="text-red-400" />,
        label: 'Colapso general',
        badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30',
        iconClass: 'text-red-400',
      };
  }
}

export default function ModalColapso({ colapso, onClose }: ModalColapsoDatosProps) {
  if (!colapso) return null;

  const tipoInfo = getTipoInfo(colapso.tipoColapso);
  const momentoFormateado = formatMomentoColapso(colapso.momentoSimulacion, colapso.fechaInicioRaw);

  return (
    <div className="fixed right-4 top-16 z-[10000] w-[340px] max-w-[calc(100vw-5rem)] max-h-[calc(100vh-5rem)] flex flex-col bg-[#0f1f3d]/95 border border-red-500/50 rounded-lg shadow-2xl shadow-red-900/30 animate-in fade-in slide-in-from-right-2 duration-200">

      {/* Borde superior rojo animado */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent rounded-t-lg" />

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-red-500/30 flex items-center justify-between bg-red-950/20 rounded-t-lg shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 ring-1 ring-red-500/40">
            <IconWarning size={16} className="text-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-red-300 leading-tight">Colapso Detectado</h3>
            <p className="text-[11px] font-semibold text-red-400/70 tracking-wider">
              Operación de Colapso — Escenario 3
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-300 transition-colors shrink-0"
          aria-label="Cerrar modal de colapso"
        >
          <IconClose size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">

        {/* Tipo de colapso */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-2">Tipo de Falla</p>
          <div className="flex items-center gap-2">
            <span className="shrink-0">{tipoInfo.icon}</span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${tipoInfo.badgeClass}`}>
              {tipoInfo.label}
            </span>
          </div>
        </div>

        {/* Razón del colapso */}
        <div className="bg-red-950/20 border border-red-500/20 rounded-md p-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Razón del Colapso</p>
          <p className="text-xs text-red-200 leading-relaxed font-medium">
            {colapso.razon}
          </p>
        </div>

        {/* Momento exacto */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Momento del Colapso</p>
          <p className="text-xs font-mono text-amber-300 font-semibold leading-relaxed">
            {momentoFormateado}
          </p>
          <p className="text-[9px] text-slate-500 mt-0.5">
            Minuto {Math.floor(colapso.momentoSimulacion)} de la simulación
          </p>
        </div>

        {/* Lugar */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Lugar</p>
          <div className="flex items-center gap-2">
            <IconMapPin size={18} className="text-blue-400 shrink-0" />
            <p className="font-mono text-sm font-bold text-blue-300">
              {colapso.lugar}
            </p>
          </div>
        </div>

        {/* Mensaje de estado */}
        <div className="bg-red-900/10 border border-red-500/20 rounded-md px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <p className="text-[10px] text-red-300/80">
            La simulación se ha detenido automáticamente al detectar el colapso.
          </p>
        </div>

      </div>
    </div>
  );
}