import React, { useEffect, useMemo, useState } from 'react';
import { RutaMuestra, AeropuertoDTO } from '@/types/rutas';
import { calcularCargaAeropuertoActual, porcentajeOcupacion, formatPorcentaje } from '@/utils/capacidad';
import { IconSearch } from '@/components/icons';

interface SidebarInfoProps {
  envios: RutaMuestra[];
  aeropuertos: AeropuertoDTO[];
  activeTab: 'pedidos' | 'aeropuertos' | 'simulacion' | null;
  simTiempoMinutos?: number;
  cargasAeropuertoOverride?: Record<string, number> | null;
  onSelectEnvio: (e: RutaMuestra) => void;
  onSelectAeropuerto: (a: AeropuertoDTO) => void;
  umbralVerde?: number;
  umbralAmbar?: number;
  filtroSemaforo?: 'todos' | 'verde' | 'ambar' | 'rojo';
  onChangeFiltroSemaforo?: (f: 'todos' | 'verde' | 'ambar' | 'rojo') => void;
}

type OrdenAero = 'codigo' | 'ciudad' | 'ocupacion_desc' | 'ocupacion_asc';

const getEnvioStatus = (e: RutaMuestra, simTime: number) => {
  if (!e.tramos || e.tramos.length === 0) {
    return {
      label: 'No ruteado',
      bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
  }

  // 1. Calcular recepción
  const receiptTime = (e.recepcionDiaOffset ?? 0) * 1440 + (e.recepcionMinutosGMT ?? 0);
  if (simTime < receiptTime) {
    return {
      label: 'No recibido',
      bg: 'bg-slate-700/40 text-slate-400 border-slate-600/30'
    };
  }

  // 2. Calcular entrega (fin del último tramo)
  const lastTramo = e.tramos[e.tramos.length - 1];
  let llegadaLast = (lastTramo.diaOffset ?? 0) * 1440 + lastTramo.llegadaMinutosGMT;
  if (lastTramo.llegadaMinutosGMT < lastTramo.salidaMinutosGMT) {
    llegadaLast += 1440;
  }

  if (simTime >= llegadaLast) {
    return {
      label: 'Entregado',
      bg: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/30 font-bold'
    };
  }

  // 3. Verificar si está volando
  for (const t of e.tramos) {
    const salidaLeg = (t.diaOffset ?? 0) * 1440 + t.salidaMinutosGMT;
    let llegadaLeg = (t.diaOffset ?? 0) * 1440 + t.llegadaMinutosGMT;
    if (t.llegadaMinutosGMT < t.salidaMinutosGMT) {
      llegadaLeg += 1440;
    }
    if (simTime >= salidaLeg && simTime <= llegadaLeg) {
      return {
        label: 'En vuelo',
        bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30 font-bold'
      };
    }
  }

  // 4. Si no está en vuelo y no ha llegado a su destino final:
  // - Si está en el origen (es decir, el primer vuelo aún no ha salido):
  const firstLeg = e.tramos[0];
  const departureFirst = (firstLeg.diaOffset ?? 0) * 1440 + firstLeg.salidaMinutosGMT;
  if (simTime < departureFirst) {
    return {
      label: 'Esperando',
      bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold'
    };
  }

  // - Si está en un aeropuerto intermedio (esperando escala):
  // (es decir, después de que llegó algún tramo y antes de que salga el siguiente)
  for (let i = 0; i < e.tramos.length - 1; i++) {
    const currentLeg = e.tramos[i];
    const nextLeg = e.tramos[i + 1];

    let arrivalCurrent = (currentLeg.diaOffset ?? 0) * 1440 + currentLeg.llegadaMinutosGMT;
    if (currentLeg.llegadaMinutosGMT < currentLeg.salidaMinutosGMT) {
      arrivalCurrent += 1440;
    }

    const departureNext = (nextLeg.diaOffset ?? 0) * 1440 + nextLeg.salidaMinutosGMT;

    if (simTime > arrivalCurrent && simTime < departureNext) {
      return {
        label: 'Esperando escala',
        bg: 'bg-orange-500/20 text-orange-300 border-orange-500/30 font-bold'
      };
    }
  }

  // Fallback si no encaja en los anteriores (por ejemplo si está en tránsito general)
  return {
    label: 'Esperando',
    bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold'
  };
};

function formatMinutosGMT(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = Math.floor(minutos % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function SidebarInfo({
  envios,
  aeropuertos,
  activeTab,
  simTiempoMinutos = 0,
  cargasAeropuertoOverride,
  onSelectEnvio,
  onSelectAeropuerto,
  umbralVerde = 30,
  umbralAmbar = 80,
  filtroSemaforo = 'todos',
  onChangeFiltroSemaforo,
}: SidebarInfoProps) {
  const [searchEnvios,     setSearchEnvios]     = useState('');
  const [searchAero,       setSearchAero]       = useState('');
  const [continenteFilter, setContinenteFilter] = useState('');
  const [ordenAero,        setOrdenAero]        = useState<OrdenAero>('codigo');

  const [pedidosPage,      setPedidosPage]      = useState(1);
  const [aeroPage,         setAeroPage]         = useState(1);

  const [pedidosPageSize,  setPedidosPageSize]  = useState(10);
  const [aeroPageSize,     setAeroPageSize]     = useState(10);

  const [filtroOrigen,     setFiltroOrigen]     = useState('todos');
  const [filtroDestino,    setFiltroDestino]    = useState('todos');
  const [filtroEstado,     setFiltroEstado]     = useState('todos');
  const [filtroUltimas4Horas, setFiltroUltimas4Horas] = useState(false);
  const [ordenPedidos,     setOrdenPedidos]     = useState<'none' | 'salida_asc' | 'llegada_asc'>('none');

  // ── Continentes únicos disponibles ──
  const continentes = useMemo(
    () => Array.from(new Set(aeropuertos.map(a => a.continente).filter(Boolean))).sort(),
    [aeropuertos]
  );

  // ── Aeropuertos y ciudades para filtros de envíos ──
  const optionsAeropuertos = useMemo(() => {
    return [...aeropuertos]
      .map(a => ({
        codigo: a.codigo,
        label: `${a.pais.toUpperCase()}-${a.codigo.toUpperCase()}`
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [aeropuertos]);

  const filteredEnvios = useMemo(() => {
    let result = envios.filter(e => {
      if (filtroOrigen !== 'todos' && e.origen !== filtroOrigen) return false;
      if (filtroDestino !== 'todos' && e.destino !== filtroDestino) return false;

      // Filtro por Estado
      const status = getEnvioStatus(e, simTiempoMinutos);
      if (filtroEstado !== 'todos' && status.label !== filtroEstado) {
        return false;
      }

      // Filtro por entregados en últimas 4 horas
      if (filtroUltimas4Horas) {
        if (status.label !== 'Entregado') return false;

        const lastTramo = e.tramos[e.tramos.length - 1];
        let llegadaLast = (lastTramo.diaOffset ?? 0) * 1440 + lastTramo.llegadaMinutosGMT;
        if (lastTramo.llegadaMinutosGMT < lastTramo.salidaMinutosGMT) {
          llegadaLast += 1440;
        }

        if (llegadaLast < simTiempoMinutos - 240 || llegadaLast > simTiempoMinutos) {
          return false;
        }
      }

      const q = searchEnvios.toLowerCase();
      if (!q) return true;
      return (
        e.envioId.toLowerCase().includes(q) ||
        e.origen.toLowerCase().includes(q) ||
        e.destino.toLowerCase().includes(q)
      );
    });

    if (ordenPedidos !== 'none') {
      result = [...result].sort((a, b) => {
        const hasA = a.tramos && a.tramos.length > 0;
        const hasB = b.tramos && b.tramos.length > 0;
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1; // Colocar no ruteados al final
        if (!hasB) return -1;

        if (ordenPedidos === 'salida_asc') {
          const salidaA = (a.tramos[0].diaOffset ?? 0) * 1440 + a.tramos[0].salidaMinutosGMT;
          const salidaB = (b.tramos[0].diaOffset ?? 0) * 1440 + b.tramos[0].salidaMinutosGMT;
          return salidaA - salidaB;
        }

        if (ordenPedidos === 'llegada_asc') {
          const lastA = a.tramos[a.tramos.length - 1];
          let llegadaA = (lastA.diaOffset ?? 0) * 1440 + lastA.llegadaMinutosGMT;
          if (lastA.llegadaMinutosGMT < lastA.salidaMinutosGMT) llegadaA += 1440;

          const lastB = b.tramos[b.tramos.length - 1];
          let llegadaB = (lastB.diaOffset ?? 0) * 1440 + lastB.llegadaMinutosGMT;
          if (lastB.llegadaMinutosGMT < lastB.salidaMinutosGMT) llegadaB += 1440;

          return llegadaA - llegadaB;
        }

        return 0;
      });
    }

    return result;
  }, [envios, searchEnvios, filtroOrigen, filtroDestino, filtroEstado, filtroUltimas4Horas, simTiempoMinutos, ordenPedidos]);

  // ── Aeropuertos filtrados + ordenados ──
  const filteredAero = useMemo(() => {
    const q = searchAero.toLowerCase();
    let result = aeropuertos.filter(a => {
      if (continenteFilter && a.continente !== continenteFilter) return false;

      // Filtro por semáforo
      if (filtroSemaforo !== 'todos') {
        const cargaActual = cargasAeropuertoOverride?.[a.codigo]
          ?? calcularCargaAeropuertoActual(a.codigo, envios, simTiempoMinutos);
        const porcentaje = a.capacidadMax > 0 ? (cargaActual / a.capacidadMax) * 100 : 0;
        
        const esVerde = porcentaje <= umbralVerde;
        const esAmbar = !esVerde && porcentaje <= umbralAmbar;
        const esRojo = !esVerde && !esAmbar;

        if (filtroSemaforo === 'verde' && !esVerde) return false;
        if (filtroSemaforo === 'ambar' && !esAmbar) return false;
        if (filtroSemaforo === 'rojo' && !esRojo) return false;
      }

      if (!q) return true;
      return (
        a.codigo.toLowerCase().includes(q) ||
        a.ciudad.toLowerCase().includes(q) ||
        a.pais.toLowerCase().includes(q)
      );
    });

    return [...result].sort((a, b) => {
      if (ordenAero === 'codigo') return a.codigo.localeCompare(b.codigo);
      if (ordenAero === 'ciudad') return a.ciudad.localeCompare(b.ciudad);
      // Ordenar por ocupación
      const cargaA = cargasAeropuertoOverride?.[a.codigo]
        ?? calcularCargaAeropuertoActual(a.codigo, envios, simTiempoMinutos);
      const cargaB = cargasAeropuertoOverride?.[b.codigo]
        ?? calcularCargaAeropuertoActual(b.codigo, envios, simTiempoMinutos);
      const pctA = a.capacidadMax > 0 ? cargaA / a.capacidadMax : 0;
      const pctB = b.capacidadMax > 0 ? cargaB / b.capacidadMax : 0;
      return ordenAero === 'ocupacion_desc' ? pctB - pctA : pctA - pctB;
    });
  }, [aeropuertos, searchAero, continenteFilter, ordenAero, cargasAeropuertoOverride, envios, simTiempoMinutos, filtroSemaforo, umbralVerde, umbralAmbar]);

  // Resetear páginas cuando cambian búsquedas o filtros
  useEffect(() => {
    setPedidosPage(1);
  }, [searchEnvios, filtroOrigen, filtroDestino, filtroEstado, filtroUltimas4Horas, ordenPedidos]);

  useEffect(() => {
    setAeroPage(1);
  }, [searchAero, continenteFilter, ordenAero, filtroSemaforo]);

  // Ajustar cantidad de elementos por página según la altura de la pantalla
  useEffect(() => {
    const handleResize = () => {
      const height = window.innerHeight;
      
      // Pedidos: header 130px + paginación 45px + padding/márgenes. Fila de pedido mide 78px.
      const pedSize = Math.max(3, Math.floor((height - 180) / 78));
      setPedidosPageSize(pedSize);

      // Aeropuertos: header 200px + paginación 45px + padding/márgenes. Fila de aeropuerto mide 92px aprox.
      const aeroSize = Math.max(3, Math.floor((height - 260) / 92));
      setAeroPageSize(aeroSize);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Paginación
  const totalPedidosPages = Math.max(1, Math.ceil(filteredEnvios.length / pedidosPageSize));
  const paginatedEnvios = useMemo(() => {
    const start = (pedidosPage - 1) * pedidosPageSize;
    return filteredEnvios.slice(start, start + pedidosPageSize);
  }, [filteredEnvios, pedidosPage, pedidosPageSize]);

  const totalAeroPages = Math.max(1, Math.ceil(filteredAero.length / aeroPageSize));
  const paginatedAero = useMemo(() => {
    const start = (aeroPage - 1) * aeroPageSize;
    return filteredAero.slice(start, start + aeroPageSize);
  }, [filteredAero, aeroPage, aeroPageSize]);

  // ── Renderiza un aeropuerto ──
  const renderAeropuerto = (a: AeropuertoDTO) => {
    const cargaActual = cargasAeropuertoOverride?.[a.codigo]
      ?? calcularCargaAeropuertoActual(a.codigo, envios, simTiempoMinutos);
    const porcentaje = porcentajeOcupacion(cargaActual, a.capacidadMax);

    const esColapso = cargaActual >= a.capacidadMax;
    const esVerde   = porcentaje <= umbralVerde;
    const esAmbar   = !esVerde && porcentaje <= umbralAmbar;
    const esRojo    = !esVerde && !esAmbar;

    const colorText  = esColapso || esRojo ? 'text-red-400'   : esAmbar ? 'text-amber-400'  : 'text-emerald-400';
    const colorBarra = esColapso || esRojo ? 'bg-red-500'      : esAmbar ? 'bg-amber-500'   : 'bg-emerald-500';
    const rowBorder  = esColapso || esRojo ? 'border-red-700/40 bg-red-950/10'
                     : esAmbar   ? 'border-amber-700/40 bg-amber-950/10'
                     :            'border-slate-700/50 bg-[#122340]';

    return (
      <div
        key={a.codigo}
        onClick={() => onSelectAeropuerto(a)}
        className={`border rounded-lg p-3 cursor-pointer hover:brightness-110 transition-all ${rowBorder}`}
      >
        {/* Encabezado */}
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold text-slate-200">{a.codigo}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${colorText}`}>{formatPorcentaje(porcentaje)}%</span>
            <span className="text-[10px] text-slate-200">{a.pais}</span>
          </div>
        </div>
        <p className="text-xs text-slate-200 truncate mb-1">{a.ciudad}</p>

        {/* Barra de ocupación */}
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/80 mb-1">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colorBarra}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>

        {/* Datos numéricos + continente */}
        <div className="flex justify-between text-[10px] text-slate-300">
          <span>
            Actual: <span className={`font-semibold ${colorText}`}>{cargaActual}</span>
            <span className="text-slate-400">/{a.capacidadMax}</span>
          </span>
          <span>{a.continente} | GMT{a.gmt >= 0 ? '+' : ''}{a.gmt}</span>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════
  // TAB: PEDIDOS
  // ══════════════════════════════════════════
  if (activeTab === 'pedidos') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 bg-[#0f1f3d]/80 border-b border-slate-700/50 shrink-0 backdrop-blur-sm space-y-2">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Pedidos ({filteredEnvios.length}/{envios.length})
          </p>
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
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

          {/* Ordenar Pedidos */}
          <div>
            <select
              value={ordenPedidos}
              onChange={e => setOrdenPedidos(e.target.value as any)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                         text-xs text-slate-300 outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="none">Ordenar por...</option>
              <option value="salida_asc">Hora de salida (primera)</option>
              <option value="llegada_asc">Hora de llegada (primera)</option>
            </select>
          </div>

          {/* Comboboxes de Origen y Destino */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filtroOrigen}
              onChange={e => setFiltroOrigen(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                         text-xs text-slate-300 outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="todos">Cualquier origen</option>
              {optionsAeropuertos.map(opt => (
                <option key={opt.codigo} value={opt.codigo}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={filtroDestino}
              onChange={e => setFiltroDestino(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                         text-xs text-slate-300 outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="todos">Cualquier destino</option>
              {optionsAeropuertos.map(opt => (
                <option key={opt.codigo} value={opt.codigo}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Combobox de Estado y Checkbox Últimas 4 Horas */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                         text-xs text-slate-300 outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="todos">Todos los estados</option>
              <option value="En vuelo">En vuelo</option>
              <option value="Entregado">Entregado</option>
              <option value="Esperando">Esperando</option>
              <option value="Esperando escala">Esperando escala</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer select-none px-1">
              <input
                type="checkbox"
                checked={filtroUltimas4Horas}
                onChange={e => setFiltroUltimas4Horas(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-300 font-semibold tracking-wide uppercase leading-tight">
                Entregados últ. 4h
              </span>
            </label>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {paginatedEnvios.length === 0 ? (
            <p className="text-center text-slate-600 text-xs pt-8">Sin resultados</p>
          ) : (
            paginatedEnvios.map((e) => {
              const status = getEnvioStatus(e, simTiempoMinutos);
              return (
                <div
                  key={e.envioId}
                  onClick={() => onSelectEnvio(e)}
                  className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 cursor-pointer
                             hover:border-blue-500/50 hover:bg-[#162a4d] transition-all"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-mono text-xs text-blue-400">{e.envioId}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold uppercase tracking-wider whitespace-nowrap ${status.bg}`}>
                        {status.label}
                      </span>
                      <span className="bg-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-200 font-mono">
                        {e.maletas === 1 ? '1 maleta' : `${e.maletas} maletas`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-200">
                    <span>{e.origen}</span>
                    <span className="text-slate-400 text-[10px]">→</span>
                    <span>{e.destino}</span>
                  </div>
                  {e.tramos && e.tramos.length > 0 && (
                    <div className="flex justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-700/30">
                      <span>
                        Despega: D{e.tramos[0].diaOffset + 1} {formatMinutosGMT(e.tramos[0].salidaMinutosGMT)}
                      </span>
                      <span>
                        Llega: D{e.tramos[e.tramos.length - 1].diaOffset + (e.tramos[e.tramos.length - 1].llegadaMinutosGMT < e.tramos[e.tramos.length - 1].salidaMinutosGMT ? 1 : 0) + 1} {formatMinutosGMT(e.tramos[e.tramos.length - 1].llegadaMinutosGMT)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Paginación */}
        {totalPedidosPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
            <button
              disabled={pedidosPage === 1}
              onClick={() => setPedidosPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <span className="text-[10px] font-mono text-slate-400">
              Pág. {pedidosPage} de {totalPedidosPages}
            </span>
            <button
              disabled={pedidosPage === totalPedidosPages}
              onClick={() => setPedidosPage(prev => Math.min(totalPedidosPages, prev + 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // TAB: AEROPUERTOS
  // ══════════════════════════════════════════
  if (activeTab === 'aeropuertos') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 bg-[#0f1f3d]/80 border-b border-slate-700/50 shrink-0 space-y-2 backdrop-blur-sm">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Aeropuertos ({filteredAero.length}/{aeropuertos.length})
          </p>

          {/* Búsqueda */}
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              value={searchAero}
              onChange={e => setSearchAero(e.target.value)}
              placeholder="Buscar por código, ciudad o país..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-1.5
                         text-xs text-slate-200 placeholder-slate-500
                         focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20
                         transition-all"
            />
          </div>

          {/* Filtro continente */}
          <select
            value={continenteFilter}
            onChange={e => setContinenteFilter(e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                       text-xs text-slate-300 outline-none focus:border-emerald-500/50"
          >
            <option value="">Todos los continentes</option>
            {continentes.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Ordenar */}
          <select
            value={ordenAero}
            onChange={e => setOrdenAero(e.target.value as OrdenAero)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1.5
                       text-xs text-slate-300 outline-none focus:border-emerald-500/50"
          >
            <option value="codigo">Ordenar: Código (A–Z)</option>
            <option value="ciudad">Ordenar: Ciudad (A–Z)</option>
            <option value="ocupacion_desc">↓ Ocupación (mayor primero)</option>
            <option value="ocupacion_asc">↑ Ocupación (menor primero)</option>
          </select>

          {/* Filtro Semáforo */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => onChangeFiltroSemaforo?.('todos')}
              className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
                filtroSemaforo === 'todos'
                  ? 'bg-slate-700 bg-opacity-60 text-slate-100 border-slate-600'
                  : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => onChangeFiltroSemaforo?.('verde')}
              className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
                filtroSemaforo === 'verde'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
              }`}
            >
              Verde
            </button>
            <button
              onClick={() => onChangeFiltroSemaforo?.('ambar')}
              className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
                filtroSemaforo === 'ambar'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
              }`}
            >
              Ámbar
            </button>
            <button
              onClick={() => onChangeFiltroSemaforo?.('rojo')}
              className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${
                filtroSemaforo === 'rojo'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-transparent text-slate-400 border-slate-800/40 hover:text-slate-200'
              }`}
            >
              Rojo
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {paginatedAero.length === 0 ? (
            <p className="text-center text-slate-600 text-xs pt-8">Sin resultados</p>
          ) : (
            paginatedAero.map(renderAeropuerto)
          )}
        </div>

        {/* Paginación */}
        {totalAeroPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
            <button
              disabled={aeroPage === 1}
              onClick={() => setAeroPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <span className="text-[10px] font-mono text-slate-400">
              Pág. {aeroPage} de {totalAeroPages}
            </span>
            <button
              disabled={aeroPage === totalAeroPages}
              onClick={() => setAeroPage(prev => Math.min(totalAeroPages, prev + 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default React.memo(SidebarInfo, (prev, next) => {
  if (
    prev.envios          !== next.envios          ||
    prev.aeropuertos     !== next.aeropuertos     ||
    prev.activeTab       !== next.activeTab       ||
    prev.onSelectEnvio   !== next.onSelectEnvio   ||
    prev.onSelectAeropuerto !== next.onSelectAeropuerto ||
    prev.umbralVerde     !== next.umbralVerde     ||
    prev.umbralAmbar     !== next.umbralAmbar     ||
    prev.filtroSemaforo  !== next.filtroSemaforo  ||
    prev.simTiempoMinutos !== next.simTiempoMinutos
  ) {
    return false;
  }

  if (next.activeTab === 'aeropuertos') {
    return prev.cargasAeropuertoOverride === next.cargasAeropuertoOverride;
  }

  return true;
});
