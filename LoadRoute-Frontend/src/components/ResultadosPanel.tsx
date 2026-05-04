'use client';

import React from 'react';
import { ResultadoAlgoritmo } from '@/types/rutas';

interface ResultadosPanelProps {
  resultadoSA: ResultadoAlgoritmo | null;
  resultadoALNS: ResultadoAlgoritmo | null;
  escenario: number;
  totalVuelos: number;
  totalEnvios: number;
}

type GanadorComparativa = 'SA' | 'ALNS' | 'Empate';

type ComparacionFila = {
  criterio: string;
  descripcion: string;
  sa: string;
  alns: string;
  diferencia: string;
  ganador: GanadorComparativa;
};

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'border-blue-500/30 text-blue-400',
    green: 'border-emerald-500/30 text-emerald-400',
    cyan: 'border-cyan-500/30 text-cyan-400',
    amber: 'border-amber-500/30 text-amber-400',
    red: 'border-red-500/30 text-red-400',
    purple: 'border-purple-500/30 text-purple-400',
  };

  return (
    <div className={`rounded-lg border bg-slate-800/40 p-3 ${colorClasses[color]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorClasses[color]?.split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function AlgoritmoBloque({ res, color }: { res: ResultadoAlgoritmo; color: 'blue' | 'green' }) {
  const borderColor = color === 'blue' ? 'border-blue-500/20' : 'border-emerald-500/20';
  const headerBg = color === 'blue' ? 'bg-blue-500/10' : 'bg-emerald-500/10';
  const titleColor = color === 'blue' ? 'text-blue-400' : 'text-emerald-400';

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
      {res.mensajeColapso && (
        <div className="bg-red-900/50 border-b border-red-500/50 p-3 text-red-300 text-xs font-bold text-center animate-pulse shadow-inner">
          Alerta: {res.mensajeColapso}
        </div>
      )}

      <div className={`px-4 py-2.5 ${headerBg} flex items-center justify-between`}>
        <span className={`text-sm font-semibold ${titleColor}`}>{res.algoritmo}</span>
        <span className="text-[10px] text-slate-400">{formatTiempo(res.tiempoEjecucionMs)}</span>
      </div>

      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Costo Inicial"
          value={formatCosto(res.costoInicial)}
          color={color === 'blue' ? 'blue' : 'green'}
        />
        <MetricCard label="Costo Final" value={formatCosto(res.costoFinal)} color="cyan" />
        <MetricCard
          label="Mejora Agregada"
          value={`${res.mejoraRelativa.toFixed(1)}%`}
          sub={`${res.iteraciones.toLocaleString()} iteraciones totales`}
          color={res.mejoraRelativa > 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Asignados"
          value={`${res.enviosAsignados}/${res.totalEnvios}`}
          sub={`${((res.enviosAsignados / Math.max(res.totalEnvios, 1)) * 100).toFixed(0)}% cobertura`}
          color="amber"
        />
      </div>

      {res.rutasMuestra && res.rutasMuestra.length > 0 && (
        <div className="border-t border-slate-700/50">
          <div className="px-4 py-2 bg-slate-800/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Muestra de Rutas ({res.rutasMuestra.length})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/40 text-slate-400">
                  <th className="text-left px-4 py-2 font-medium">Envio</th>
                  <th className="text-left px-4 py-2 font-medium">Ruta</th>
                  <th className="text-right px-4 py-2 font-medium">Maletas</th>
                  <th className="text-right px-4 py-2 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {res.rutasMuestra.map((ruta, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-slate-300">{ruta.envioId.slice(-5)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold text-blue-300">{ruta.origen}</span>
                        {ruta.tramos.map((t, j) => (
                          <React.Fragment key={j}>
                            <span className="text-slate-500">-&gt;</span>
                            <span className="text-emerald-300">{t.destino}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="text-right px-4 py-2 text-slate-300">{ruta.maletas}</td>
                    <td className="text-right px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold
                          ${ruta.slaHoras <= 24 ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}
                      >
                        {ruta.slaHoras}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparativaPanel({
  resultadoSA,
  resultadoALNS,
}: {
  resultadoSA: ResultadoAlgoritmo;
  resultadoALNS: ResultadoAlgoritmo;
}) {
  const coberturaSA = ratioAsignados(resultadoSA) * 100;
  const coberturaALNS = ratioAsignados(resultadoALNS) * 100;
  const filas: ComparacionFila[] = [
    {
      criterio: 'Costo final',
      descripcion: 'Menor costo total de las rutas asignadas.',
      sa: formatCosto(resultadoSA.costoFinal),
      alns: formatCosto(resultadoALNS.costoFinal),
      diferencia: formatDiferencia(resultadoSA.costoFinal - resultadoALNS.costoFinal, ''),
      ganador: ganadorMenor(resultadoSA.costoFinal, resultadoALNS.costoFinal),
    },
    {
      criterio: 'Mejora Agregada',
      descripcion: 'Reduccion porcentual global respecto al costo inicial acumulado.',
      sa: `${resultadoSA.mejoraRelativa.toFixed(1)}%`,
      alns: `${resultadoALNS.mejoraRelativa.toFixed(1)}%`,
      diferencia: formatDiferencia(resultadoSA.mejoraRelativa - resultadoALNS.mejoraRelativa, ' pp'),
      ganador: ganadorMayor(resultadoSA.mejoraRelativa, resultadoALNS.mejoraRelativa, 0.05),
    },
    {
      criterio: 'Tiempo',
      descripcion: 'Menor tiempo de ejecucion del algoritmo.',
      sa: formatTiempo(resultadoSA.tiempoEjecucionMs),
      alns: formatTiempo(resultadoALNS.tiempoEjecucionMs),
      diferencia: formatDiferencia(resultadoSA.tiempoEjecucionMs - resultadoALNS.tiempoEjecucionMs, ' ms'),
      ganador: ganadorMenor(resultadoSA.tiempoEjecucionMs, resultadoALNS.tiempoEjecucionMs, 5),
    },
    {
      criterio: 'Cobertura',
      descripcion: 'Mayor porcentaje de envios asignados.',
      sa: `${resultadoSA.enviosAsignados}/${resultadoSA.totalEnvios} (${coberturaSA.toFixed(0)}%)`,
      alns: `${resultadoALNS.enviosAsignados}/${resultadoALNS.totalEnvios} (${coberturaALNS.toFixed(0)}%)`,
      diferencia: formatDiferencia(coberturaSA - coberturaALNS, ' pp'),
      ganador: ganadorMayor(coberturaSA, coberturaALNS, 0.05),
    },
  ];

  const puntosSA = filas.filter(f => f.ganador === 'SA').length;
  const puntosALNS = filas.filter(f => f.ganador === 'ALNS').length;
  const veredicto = puntosSA === puntosALNS
    ? 'Empate tecnico'
    : puntosSA > puntosALNS
      ? 'SA lidera la comparativa'
      : 'ALNS lidera la comparativa';
  const veredictoColor = puntosSA === puntosALNS
    ? 'text-slate-200'
    : puntosSA > puntosALNS
      ? 'text-blue-300'
      : 'text-emerald-300';

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-purple-500/20 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
            Comparativa SA vs ALNS
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Se compara por costo, mejora, tiempo y cobertura. Menor costo/tiempo gana; mayor mejora/cobertura gana.
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className={`text-sm font-bold ${veredictoColor}`}>{veredicto}</p>
          <p className="text-[11px] text-slate-500">SA {puntosSA} - ALNS {puntosALNS}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead>
            <tr className="border-b border-slate-700/40 text-slate-400">
              <th className="text-left px-4 py-2 font-medium">Criterio</th>
              <th className="text-right px-4 py-2 font-medium">SA</th>
              <th className="text-right px-4 py-2 font-medium">ALNS</th>
              <th className="text-right px-4 py-2 font-medium">Diferencia SA - ALNS</th>
              <th className="text-center px-4 py-2 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(fila => (
              <tr key={fila.criterio} className="border-b border-slate-800/60 last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-200">{fila.criterio}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{fila.descripcion}</p>
                </td>
                <td className="text-right px-4 py-3 font-mono text-blue-300">{fila.sa}</td>
                <td className="text-right px-4 py-3 font-mono text-emerald-300">{fila.alns}</td>
                <td className="text-right px-4 py-3 font-mono text-slate-300">{fila.diferencia}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex min-w-20 justify-center rounded-md px-2 py-1 text-[11px] font-bold
                      ${fila.ganador === 'SA'
                        ? 'bg-blue-500/15 text-blue-300'
                        : fila.ganador === 'ALNS'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-slate-700/60 text-slate-300'}`}
                  >
                    {fila.ganador}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultadosPanel({
  resultadoSA,
  resultadoALNS,
  escenario,
  totalVuelos,
  totalEnvios,
}: ResultadosPanelProps) {
  if (!resultadoSA && !resultadoALNS) return null;

  return (
    <div className="space-y-4 fade-in-up">
      <div className="flex items-center gap-4 text-xs text-slate-400 px-1">
        <span>Red: <strong className="text-slate-200">{totalVuelos.toLocaleString()}</strong> vuelos</span>
        <span className="text-slate-600">|</span>
        <span>Envios procesados: <strong className="text-slate-200">{totalEnvios.toLocaleString()}</strong></span>
        <span className="text-slate-600">|</span>
        <span>Escenario: <strong className="text-slate-200">{escenario}</strong></span>
      </div>

      {resultadoSA && resultadoALNS && (
        <ComparativaPanel resultadoSA={resultadoSA} resultadoALNS={resultadoALNS} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resultadoSA && <AlgoritmoBloque res={resultadoSA} color="blue" />}
        {resultadoALNS && <AlgoritmoBloque res={resultadoALNS} color="green" />}
      </div>
    </div>
  );
}

function ratioAsignados(res: ResultadoAlgoritmo): number {
  return res.enviosAsignados / Math.max(res.totalEnvios, 1);
}

function formatTiempo(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function ganadorMenor(sa: number, alns: number, tolerancia = 0): GanadorComparativa {
  if (Math.abs(sa - alns) <= tolerancia) return 'Empate';
  return sa < alns ? 'SA' : 'ALNS';
}

function ganadorMayor(sa: number, alns: number, tolerancia = 0): GanadorComparativa {
  if (Math.abs(sa - alns) <= tolerancia) return 'Empate';
  return sa > alns ? 'SA' : 'ALNS';
}

function formatCosto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatDiferencia(n: number, suffix: string): string {
  if (Math.abs(n) < 0.005) return `0${suffix}`;
  const sign = n > 0 ? '+' : '';
  const value = suffix === ' ms' ? n.toFixed(0) : n.toFixed(1);
  return `${sign}${value}${suffix}`;
}
