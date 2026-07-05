import React, { useEffect, useState, useMemo } from 'react';
import {
  obtenerAeropuertos,
  crearAeropuerto,
  actualizarAeropuerto,
  eliminarAeropuerto,
  obtenerVuelos,
  crearVuelo,
  actualizarVuelo,
  eliminarVuelo,
  AeropuertoCreateDTO,
  VueloCreateDTO,
  VueloResponseDTO,
  obtenerEnviosDiaADia,
  crearEnvioDiaADia,
  limpiarEnviosDiaADia,
  cargarArchivosDiaADia,
  EnvioDiaADiaResponse,
  EnvioDiaADiaCreateDTO
} from '@/services/maestrosService';
import { AeropuertoDTO } from '@/types/rutas';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  calcularDistancia,
  encontrarAeropuertoMasCercano,
  obtenerUbicacionNavegador
} from '@/utils/geolocation';
import {
  IconBuilding, IconPlane, IconSearch, IconPlus, IconEdit, IconTrash, IconClose, IconPackage, IconRefresh
} from '@/components/icons';

type AdminTab = 'aeropuertos' | 'vuelos' | 'enviosDiaADia';

interface AdminPanelProps {
  escenario?: number;
  onSelectEnvio?: (envioId: string) => void;
}

export default function AdminPanel({ escenario, onSelectEnvio }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(
    escenario === 2 ? 'enviosDiaADia' : 'aeropuertos'
  );

  useEffect(() => {
    if (escenario === 2) {
      setActiveTab('enviosDiaADia');
    }
  }, [escenario]);
  const [aeropuertos, setAeropuertos] = useState<AeropuertoDTO[]>([]);
  const [vuelos, setVuelos] = useState<VueloResponseDTO[]>([]);
  const [envios, setEnvios] = useState<EnvioDiaADiaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchAero, setSearchAero] = useState('');
  const [searchVuelo, setSearchVuelo] = useState('');
  const [searchEnvio, setSearchEnvio] = useState('');
  const [aeroForm, setAeroForm] = useState<AeropuertoCreateDTO | null>(null);
  const [vueloForm, setVueloForm] = useState<VueloCreateDTO & { id?: number } | null>(null);
  const [envioForm, setEnvioForm] = useState<EnvioDiaADiaCreateDTO | null>(null);
  const [envioFile, setEnvioFile] = useState<File | null>(null);
  const [envioFileName, setEnvioFileName] = useState('');
  
  const [isDemo] = useState(() => {
    return new URLSearchParams(window.location.search).get('demo') === 'true';
  });
  const [aeropuertoDetectado, setAeropuertoDetectado] = useState<AeropuertoDTO | null>(null);

  const [aeroPage, setAeroPage] = useState(1);
  const [vueloPage, setVueloPage] = useState(1);
  const [envioPage, setEnvioPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useWebSocket({
    topic: '/topic/maestros',
    onMessage: () => cargarDatos(true),
  });

  useEffect(() => {
    cargarDatos();
  }, [activeTab]);

  const cargarDatos = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg('');
    try {
      if (activeTab === 'aeropuertos') {
        setAeropuertos(await obtenerAeropuertos());
      } else if (activeTab === 'vuelos') {
        setVuelos(await obtenerVuelos());
      } else if (activeTab === 'enviosDiaADia') {
        setEnvios(await obtenerEnviosDiaADia());
        if (aeropuertos.length === 0) {
          setAeropuertos(await obtenerAeropuertos());
        }
      }
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string, isError = false) => {
    if (isError) setErrorMsg(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setErrorMsg(''); setSuccessMsg(''); }, 5000);
  };

  const handleGuardarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envioForm) return;

    let dto = { ...envioForm };
    if (aeropuertoDetectado && dto.fechaCreacionLocal) {
       // La fecha está como "YYYY-MM-DDTHH:mm"
       const absoluteTime = new Date(dto.fechaCreacionLocal + 'Z'); 
       const offsetMs = aeropuertoDetectado.gmt * 3600000;
       const utcReal = new Date(absoluteTime.getTime() - offsetMs);
       
       dto.fechaCreacionLocal = utcReal.toISOString();
    }

    try {
      await crearEnvioDiaADia(dto);
      showMessage('Envío manual creado correctamente');
      setEnvioForm(null);
      setAeropuertoDetectado(null);
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  const handleLimpiarEnvios = async () => {
    if (!confirm('¿Estás seguro de que deseas limpiar TODOS los envíos del día a día de la base de datos?')) return;
    try {
      await limpiarEnviosDiaADia();
      showMessage('Todos los envíos día a día han sido eliminados.');
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  const handleFileChangeEnvios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setEnvioFile(null);
      setEnvioFileName('');
      return;
    }
    const file = fileList[0];
    if (file) {
      setEnvioFile(file);
      setEnvioFileName(file.name);
    }
  };

  const handleSubirArchivoEnvio = async () => {
    if (!envioFile) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await cargarArchivosDiaADia(envioFile);
      showMessage(res.message);
      setEnvioFile(null);
      setEnvioFileName('');
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarAeropuerto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aeroForm) return;
    try {
      const elementHtml = document.getElementById('isEditAero') as HTMLInputElement;
      const isEdit = elementHtml?.value === 'true';
      if (isEdit) {
        await actualizarAeropuerto(aeroForm.codigo, aeroForm);
        showMessage('Aeropuerto actualizado correctamente');
      } else {
        await crearAeropuerto(aeroForm);
        showMessage('Aeropuerto creado correctamente');
      }
      setAeroForm(null);
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  const handleEliminarAeropuerto = async (codigo: string) => {
    if (!confirm(`¿Estás seguro de eliminar el aeropuerto ${codigo}?`)) return;
    try {
      await eliminarAeropuerto(codigo);
      showMessage('Aeropuerto eliminado');
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  const handleGuardarVuelo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vueloForm) return;
    try {
      if (vueloForm.id) {
        await actualizarVuelo(vueloForm.id, vueloForm);
        showMessage('Vuelo actualizado correctamente');
      } else {
        await crearVuelo(vueloForm);
        showMessage('Vuelo creado correctamente');
      }
      setVueloForm(null);
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  const handleEliminarVuelo = async (id: number) => {
    if (!confirm(`¿Estás seguro de eliminar el vuelo #${id}?`)) return;
    try {
      await eliminarVuelo(id);
      showMessage('Vuelo eliminado');
      cargarDatos();
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : 'Error', true);
    }
  };

  // Resetear páginas cuando cambian búsquedas o pestañas
  useEffect(() => {
    setAeroPage(1);
  }, [searchAero]);

  useEffect(() => {
    setVueloPage(1);
  }, [searchVuelo]);

  useEffect(() => {
    setEnvioPage(1);
  }, [searchEnvio]);

  useEffect(() => {
    setAeroPage(1);
    setVueloPage(1);
    setEnvioPage(1);
  }, [activeTab]);

  // Ajustar cantidad de elementos por página según la altura de la pantalla
  useEffect(() => {
    const handleResize = () => {
      const height = window.innerHeight;
      // Tabs ocupan 45px, header 80px + paginación 45px + padding/márgenes. Cada fila mide 70px aprox.
      const size = Math.max(3, Math.floor((height - 210) / 70));
      setPageSize(size);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Paginación Aeropuertos
  const filteredAeropuertos = useMemo(() => {
    return aeropuertos.filter(a => !searchAero || a.codigo.toLowerCase().includes(searchAero.toLowerCase()) || a.ciudad.toLowerCase().includes(searchAero.toLowerCase()));
  }, [aeropuertos, searchAero]);

  const totalAeroPages = Math.max(1, Math.ceil(filteredAeropuertos.length / pageSize));
  const paginatedAeropuertos = useMemo(() => {
    const start = (aeroPage - 1) * pageSize;
    return filteredAeropuertos.slice(start, start + pageSize);
  }, [filteredAeropuertos, aeroPage, pageSize]);

  // Paginación Vuelos
  const filteredVuelos = useMemo(() => {
    return vuelos.filter(v => !searchVuelo || v.origenCodigo.toLowerCase().includes(searchVuelo.toLowerCase()) || v.destinoCodigo.toLowerCase().includes(searchVuelo.toLowerCase()));
  }, [vuelos, searchVuelo]);

  const totalVueloPages = Math.max(1, Math.ceil(filteredVuelos.length / pageSize));
  const paginatedVuelos = useMemo(() => {
    const start = (vueloPage - 1) * pageSize;
    return filteredVuelos.slice(start, start + pageSize);
  }, [filteredVuelos, vueloPage, pageSize]);

  // Paginación Envíos
  const filteredEnvios = useMemo(() => {
    return envios.filter(e => 
      !searchEnvio || 
      e.claveCompuesta.toLowerCase().includes(searchEnvio.toLowerCase()) || 
      e.clienteId.toLowerCase().includes(searchEnvio.toLowerCase()) ||
      e.origen.codigo.toLowerCase().includes(searchEnvio.toLowerCase()) ||
      e.destino.codigo.toLowerCase().includes(searchEnvio.toLowerCase())
    );
  }, [envios, searchEnvio]);

  const totalEnvioPages = Math.max(1, Math.ceil(filteredEnvios.length / pageSize));
  const paginatedEnvios = useMemo(() => {
    const start = (envioPage - 1) * pageSize;
    return filteredEnvios.slice(start, start + pageSize);
  }, [filteredEnvios, envioPage, pageSize]);

  const inputClass = 'w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all';
  const labelClass = 'block text-[10px] text-slate-500 uppercase tracking-wider mb-1';

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-200">
      {/* Sub-tabs */}
      <div className="flex border-b border-slate-700/50 bg-[#0f1f3d]/80 shrink-0">
        {escenario !== 2 && (
          <>
            <button
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5
                ${activeTab === 'aeropuertos'
                  ? 'text-rose-400 border-b-2 border-rose-500 bg-rose-500/5'
                  : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setActiveTab('aeropuertos')}
            >
              <IconBuilding size={14} /> Aeropuertos
            </button>
            <button
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5
                ${activeTab === 'vuelos'
                  ? 'text-rose-400 border-b-2 border-rose-500 bg-rose-500/5'
                  : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setActiveTab('vuelos')}
            >
              <IconPlane size={14} /> Vuelos
            </button>
          </>
        )}
        <button
          className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5
            ${activeTab === 'enviosDiaADia'
              ? 'text-rose-400 border-b-2 border-rose-500 bg-rose-500/5'
              : 'text-slate-500 hover:text-slate-300'}`}
          onClick={() => setActiveTab('enviosDiaADia')}
        >
          <IconPackage size={14} /> Envíos Día a Día
        </button>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs shrink-0">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-400 text-xs shrink-0">
          {successMsg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        {activeTab === 'aeropuertos' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-3 pt-3 pb-2 bg-[#0f1f3d]/70 border-b border-slate-700/50 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  Aeropuertos ({filteredAeropuertos.length})
                </p>
                <button
                  onClick={() => setAeroForm({ codigo: '', ciudad: '', pais: '', continente: '', gmt: 0, capacidadMax: 1000, latitud: 0, longitud: 0 })}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold hover:bg-rose-500/30 transition-colors"
                >
                  <IconPlus size={12} /> Nuevo
                </button>
              </div>
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Buscar por código o ciudad..."
                  className={`${inputClass} pl-7`}
                  value={searchAero}
                  onChange={e => setSearchAero(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {aeroForm && (
                <form onSubmit={handleGuardarAeropuerto} className="bg-[#122340] border border-rose-500/30 rounded-lg p-3 space-y-2 mb-2">
                  <input type="hidden" id="isEditAero" value={aeropuertos.some(a => a.codigo === aeroForm.codigo) ? 'true' : 'false'} />
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-rose-300">
                      {aeropuertos.some(a => a.codigo === aeroForm.codigo) ? 'Editar aeropuerto' : 'Nuevo aeropuerto'}
                    </p>
                    <button type="button" onClick={() => setAeroForm(null)} className="text-slate-500 hover:text-slate-300">
                      <IconClose size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Código</label>
                      <input required maxLength={4} className={inputClass} value={aeroForm.codigo}
                        onChange={e => setAeroForm({ ...aeroForm, codigo: e.target.value.toUpperCase() })}
                        disabled={aeropuertos.some(a => a.codigo === aeroForm.codigo)} />
                    </div>
                    <div>
                      <label className={labelClass}>Ciudad</label>
                      <input required className={inputClass} value={aeroForm.ciudad} onChange={e => setAeroForm({ ...aeroForm, ciudad: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>País</label>
                      <input required className={inputClass} value={aeroForm.pais} onChange={e => setAeroForm({ ...aeroForm, pais: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Continente</label>
                      <input required className={inputClass} value={aeroForm.continente} onChange={e => setAeroForm({ ...aeroForm, continente: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>GMT</label>
                      <input required type="number" className={inputClass} value={aeroForm.gmt} onChange={e => setAeroForm({ ...aeroForm, gmt: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={labelClass}>Capacidad</label>
                      <input required type="number" min="0" className={inputClass} value={aeroForm.capacidadMax} onChange={e => setAeroForm({ ...aeroForm, capacidadMax: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={labelClass}>Latitud</label>
                      <input required type="number" step="0.000001" className={inputClass} value={aeroForm.latitud} onChange={e => setAeroForm({ ...aeroForm, latitud: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={labelClass}>Longitud</label>
                      <input required type="number" step="0.000001" className={inputClass} value={aeroForm.longitud} onChange={e => setAeroForm({ ...aeroForm, longitud: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setAeroForm(null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-700/50">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold hover:bg-emerald-500/30">Guardar</button>
                  </div>
                </form>
              )}

              {loading ? (
                <p className="text-slate-500 text-xs text-center py-8">Cargando...</p>
              ) : (
                paginatedAeropuertos.map(a => (
                  <div key={a.codigo} className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 hover:border-rose-500/30 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm font-bold text-rose-300">{a.codigo}</span>
                          <span className="text-xs text-slate-200 truncate">{a.ciudad}, {a.pais}</span>
                        </div>
                        <div className="text-[10px] text-slate-300 flex gap-3">
                          <span>GMT{a.gmt > 0 ? `+${a.gmt}` : a.gmt}</span>
                          <span>Cap: {a.capacidadMax.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setAeroForm(a)} className="p-1.5 text-slate-500 hover:text-rose-300 rounded hover:bg-rose-500/10 transition-colors" title="Editar">
                          <IconEdit size={14} />
                        </button>
                        <button onClick={() => handleEliminarAeropuerto(a.codigo)} className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors" title="Eliminar">
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {!loading && filteredAeropuertos.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-8">No hay aeropuertos registrados</p>
              )}
            </div>

            {/* Paginación Aeropuertos */}
            {!loading && totalAeroPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
                <button
                  type="button"
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
                  type="button"
                  disabled={aeroPage === totalAeroPages}
                  onClick={() => setAeroPage(prev => Math.min(totalAeroPages, prev + 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'vuelos' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-3 pt-3 pb-2 bg-[#0f1f3d]/70 border-b border-slate-700/50 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  Vuelos ({filteredVuelos.length})
                </p>
                <button
                  onClick={() => setVueloForm({ origenCodigo: '', destinoCodigo: '', horaSalidaLocal: '08:00:00', horaLlegadaLocal: '10:00:00', capacidadMax: 300 })}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold hover:bg-rose-500/30 transition-colors"
                >
                  <IconPlus size={12} /> Nuevo
                </button>
              </div>
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Buscar por código (ej. SPJC)..."
                  className={`${inputClass} pl-7`}
                  value={searchVuelo}
                  onChange={e => setSearchVuelo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {vueloForm && (
                <form onSubmit={handleGuardarVuelo} className="bg-[#122340] border border-rose-500/30 rounded-lg p-3 space-y-2 mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-rose-300">
                      {vueloForm.id ? 'Editar vuelo' : 'Nuevo vuelo'}
                    </p>
                    <button type="button" onClick={() => setVueloForm(null)} className="text-slate-500 hover:text-slate-300">
                      <IconClose size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Origen</label>
                      <input required maxLength={4} className={inputClass} value={vueloForm.origenCodigo} onChange={e => setVueloForm({ ...vueloForm, origenCodigo: e.target.value.toUpperCase() })} placeholder="SKBO" />
                    </div>
                    <div>
                      <label className={labelClass}>Destino</label>
                      <input required maxLength={4} className={inputClass} value={vueloForm.destinoCodigo} onChange={e => setVueloForm({ ...vueloForm, destinoCodigo: e.target.value.toUpperCase() })} placeholder="SPJC" />
                    </div>
                    <div>
                      <label className={labelClass}>Hora salida</label>
                      <input required type="time" step="1" className={inputClass} value={vueloForm.horaSalidaLocal} onChange={e => setVueloForm({ ...vueloForm, horaSalidaLocal: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Hora llegada</label>
                      <input required type="time" step="1" className={inputClass} value={vueloForm.horaLlegadaLocal} onChange={e => setVueloForm({ ...vueloForm, horaLlegadaLocal: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelClass}>Capacidad</label>
                      <input required type="number" min="1" className={inputClass} value={vueloForm.capacidadMax} onChange={e => setVueloForm({ ...vueloForm, capacidadMax: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setVueloForm(null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-700/50">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold hover:bg-emerald-500/30">Guardar</button>
                  </div>
                </form>
              )}

              {loading ? (
                <p className="text-slate-500 text-xs text-center py-8">Cargando...</p>
              ) : (
                paginatedVuelos.map(v => (
                  <div key={v.id} className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 hover:border-rose-500/30 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm font-bold text-slate-200">
                            {v.origenCodigo} <span className="text-rose-400">→</span> {v.destinoCodigo}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">#{v.id}</span>
                        </div>
                        <div className="text-[10px] text-slate-300 flex gap-3">
                          <span>Sal: {v.horaSalidaLocal}</span>
                          <span>Lleg: {v.horaLlegadaLocal}</span>
                          <span>Cap: {v.capacidadMax.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setVueloForm(v)} className="p-1.5 text-slate-500 hover:text-rose-300 rounded hover:bg-rose-500/10 transition-colors" title="Editar">
                          <IconEdit size={14} />
                        </button>
                        <button onClick={() => handleEliminarVuelo(v.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors" title="Eliminar">
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {!loading && filteredVuelos.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-8">No hay vuelos registrados</p>
              )}
            </div>

            {/* Paginación Vuelos */}
            {!loading && totalVueloPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
                <button
                  type="button"
                  disabled={vueloPage === 1}
                  onClick={() => setVueloPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Anterior
                </button>
                <span className="text-[10px] font-mono text-slate-400">
                  Pág. {vueloPage} de {totalVueloPages}
                </span>
                <button
                  type="button"
                  disabled={vueloPage === totalVueloPages}
                  onClick={() => setVueloPage(prev => Math.min(totalVueloPages, prev + 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- ENVÍOS DÍA A DÍA TAB --- */}
        {activeTab === 'enviosDiaADia' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar / Buscar y Acciones */}
            <div className="p-3 bg-[#0f1f3d]/30 border-b border-slate-700/30 flex gap-2 items-center justify-between shrink-0">
              <div className="relative flex-1 max-w-[200px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <IconSearch size={12} />
                </span>
                <input
                  type="text"
                  placeholder="Buscar envío..."
                  className={`${inputClass} pl-7`}
                  value={searchEnvio}
                  onChange={e => setSearchEnvio(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    setEnvioForm({
                      clienteId: '',
                      origenCodigo: '',
                      destinoCodigo: '',
                      fechaCreacionLocal: '',
                      cantidadMaletas: 1,
                    });
                    try {
                      const { lat, lon } = await obtenerUbicacionNavegador();
                      const cercano = encontrarAeropuertoMasCercano(lat, lon, aeropuertos);
                      
                      let localTime = '';
                      if (cercano) {
                        setAeropuertoDetectado(cercano);
                        const nowUTC = new Date();
                        const offsetHoras = cercano.gmt;
                        const localDate = new Date(nowUTC.getTime() + offsetHoras * 3600000);
                        localTime = localDate.toISOString().slice(0, 16);
                      }

                      setEnvioForm(prev => prev ? ({
                        ...prev,
                        origenCodigo: cercano ? cercano.codigo : '',
                        fechaCreacionLocal: localTime,
                      }) : null);
                    } catch (err) {
                      showMessage("No se pudo obtener la ubicación. Por favor, acepta los permisos de ubicación.", true);
                    }
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold hover:bg-rose-500/20 transition-all flex items-center gap-1"
                >
                  <IconPlus size={14} /> Manual
                </button>
                <button
                  onClick={handleLimpiarEnvios}
                  className="px-2 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-300 border border-red-500/20 font-semibold hover:bg-red-500/20 transition-all flex items-center gap-1"
                  title="Limpiar todos los envíos"
                >
                  <IconRefresh size={14} /> Limpiar
                </button>
              </div>
            </div>

            {/* Panel de Carga de Archivos */}
            <div className="px-3 py-2.5 bg-[#0f1f3d]/20 border-b border-slate-700/30 shrink-0">
              <div className="flex items-center gap-2">
                <label className="flex-1 bg-slate-800/40 border border-dashed border-slate-700 hover:border-rose-500/30 rounded-lg px-3 py-2 cursor-pointer transition-all flex items-center justify-between text-xs">
                  <span className="text-slate-400 truncate max-w-[180px]">
                    {envioFileName || 'Subir archivo (_envios_XXXX_.txt)'}
                  </span>
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileChangeEnvios}
                  />
                  <span className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider shrink-0 ml-2">Seleccionar</span>
                </label>
                {envioFile && (
                  <button
                    onClick={handleSubirArchivoEnvio}
                    className="px-3 py-2 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold hover:bg-emerald-500/30 transition-all"
                  >
                    Cargar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {envioForm && (
                <form onSubmit={handleGuardarEnvio} className="bg-[#122340] border border-rose-500/30 rounded-lg p-3 space-y-2 mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-rose-300">Registrar Envío Manual</p>
                    <button type="button" onClick={() => setEnvioForm(null)} className="text-slate-500 hover:text-slate-300">
                      <IconClose size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className={labelClass}>Cliente ID</label>
                      <input required className={inputClass} value={envioForm.clienteId} onChange={e => setEnvioForm({ ...envioForm, clienteId: e.target.value })} placeholder="CLI0001" />
                    </div>
                    <div>
                      <label className={labelClass}>Origen Detectado</label>
                      <div className={`${inputClass} bg-slate-800/80 text-slate-400 select-none`}>
                        {envioForm.origenCodigo 
                          ? `${envioForm.origenCodigo} - ${aeropuertoDetectado?.ciudad || ''}`
                          : 'Detectando ubicación...'}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Destino</label>
                      <select 
                        required 
                        className={inputClass} 
                        value={envioForm.destinoCodigo} 
                        onChange={e => setEnvioForm({ ...envioForm, destinoCodigo: e.target.value })}
                      >
                        <option value="">Seleccione...</option>
                        {aeropuertos.map(a => (
                          <option key={a.codigo} value={a.codigo}>{a.codigo} - {a.ciudad}</option>
                        ))}
                      </select>
                    </div>
                    <div className={isDemo ? "" : "col-span-2"}>
                      <label className={labelClass}>Cant. Maletas</label>
                      <input required type="number" min="1" className={inputClass} value={envioForm.cantidadMaletas} onChange={e => setEnvioForm({ ...envioForm, cantidadMaletas: parseInt(e.target.value) || 1 })} />
                    </div>
                    {isDemo && (
                      <div className="col-span-2">
                        <label className={labelClass}>
                          Fecha de Recepción (Hora Local: GMT{aeropuertoDetectado?.gmt !== undefined ? (aeropuertoDetectado.gmt > 0 ? `+${aeropuertoDetectado.gmt}` : aeropuertoDetectado.gmt) : ''})
                        </label>
                        <input
                          type="datetime-local"
                          required
                          className={inputClass}
                          value={envioForm.fechaCreacionLocal}
                          onChange={e => setEnvioForm({ ...envioForm, fechaCreacionLocal: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEnvioForm(null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-700/50">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold hover:bg-emerald-500/30">Guardar</button>
                  </div>
                </form>
              )}

              {loading ? (
                <p className="text-slate-500 text-xs text-center py-8">Cargando...</p>
              ) : (
                paginatedEnvios.map(e => (
                  <div
                    key={e.id}
                    onClick={() => {
                      if (onSelectEnvio && e.claveCompuesta) {
                        onSelectEnvio(e.claveCompuesta);
                      }
                    }}
                    className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 hover:border-rose-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs font-bold text-slate-200">
                            {e.origen?.codigo} <span className="text-rose-400">→</span> {e.destino?.codigo}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">{e.claveCompuesta}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex gap-3">
                          <span>Cliente: {e.clienteId}</span>
                          <span>Maletas: {e.cantidadMaletas}</span>
                          <span>Registro GMT 0: {e.fechaCreacion?.replace('T', ' ')}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-semibold shrink-0 uppercase tracking-wider
                        ${e.rutaDefinida 
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                        {e.rutaDefinida ? 'Ruta Definida' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                ))
              )}
              {!loading && filteredEnvios.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-8">No hay envíos registrados</p>
              )}
            </div>

            {/* Paginación Envíos */}
            {!loading && totalEnvioPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/40 bg-[#0f1f3d]/40 shrink-0">
                <button
                  type="button"
                  disabled={envioPage === 1}
                  onClick={() => setEnvioPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Anterior
                </button>
                <span className="text-[10px] font-mono text-slate-400">
                  Pág. {envioPage} de {totalEnvioPages}
                </span>
                <button
                  type="button"
                  disabled={envioPage === totalEnvioPages}
                  onClick={() => setEnvioPage(prev => Math.min(totalEnvioPages, prev + 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
