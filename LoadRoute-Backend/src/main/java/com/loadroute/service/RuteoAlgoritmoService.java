package com.loadroute.service;

import com.loadroute.algorithm.*;
import com.loadroute.algorithm.graph.RedLogistica;
import com.loadroute.algorithm.model.*;
import com.loadroute.algorithm.model.SolucionEstado;
import com.loadroute.algorithm.parser.Parsers;
import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.dto.RutaResponseDTO.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import com.loadroute.repository.VueloCanceladoRepository;
import com.loadroute.repository.VueloCanceladoPeriodoRepository;
import com.loadroute.entity.VueloCanceladoEntity;
import com.loadroute.entity.VueloCanceladoPeriodoEntity;

/**
 * Servicio principal de ruteo de Tasf.B2B.
 * Todos los escenarios usan Simulated Annealing (SA).
 */
@Service
public class RuteoAlgoritmoService {

    private static final Logger LOG = Logger.getLogger(RuteoAlgoritmoService.class.getName());

    private final CargaDatosService cargaDatosService;
    private final VueloCanceladoRepository vueloCanceladoRepository;
    private final VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository;

    public RuteoAlgoritmoService(CargaDatosService cargaDatosService,
            VueloCanceladoRepository vueloCanceladoRepository,
            VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository) {
        this.cargaDatosService = cargaDatosService;
        this.vueloCanceladoRepository = vueloCanceladoRepository;
        this.vueloCanceladoPeriodoRepository = vueloCanceladoPeriodoRepository;
    }

    public interface SimulacionIterator {
        boolean hasNext();

        RutaResponseDTO nextChunk();

        boolean hasColapsado();

        String getMensajeColapso();

        int getSa();

        int getK();

        int getEscenario();

        LocalDateTime getCurrentTime();
    }

    @FunctionalInterface
    public interface ProgressReporter {
        void update(int progress, String message);

        default void onChunk(RutaResponseDTO chunk) {
        }
    }

    private static final DateTimeFormatter FMT_FECHA = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter FMT_FECHA_HORA = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    public static class ParametrosSimulacion {
        private final int sa;
        private final int k;

        public ParametrosSimulacion(int sa, int k) {
            this.sa = sa;
            this.k = k;
        }

        public int getSa() {
            return sa;
        }

        public int getK() {
            return k;
        }

        public int getScMinutos() {
            return sa * k;
        }
    }

    public static ParametrosSimulacion obtenerParametrosSimulacion(int escenario) {
        if (escenario == 2) {
            return new ParametrosSimulacion(1, 1);
        }

        if (escenario == 3) {
            return new ParametrosSimulacion(1, 140);
        }

        if (escenario == 1) {
            return new ParametrosSimulacion(1, 80);
        }

        return new ParametrosSimulacion(1, 80);
    }

    private static final int MAX_RUTAS_MUESTRA = 10_000;

    public List<RutaResponseDTO> ejecutarRuteo(InputStream aeropuertosIS,
            InputStream vuelosIS,
            List<MultipartFile> enviosFiles,
            int escenario,
            String fechaInicio,
            String fechaFin) throws IOException {
        return ejecutarRuteo(aeropuertosIS, vuelosIS, enviosFiles, escenario, fechaInicio, fechaFin, null);
    }

    public List<RutaResponseDTO> ejecutarRuteo(InputStream aeropuertosIS,
            InputStream vuelosIS,
            List<MultipartFile> enviosFiles,
            int escenario,
            String fechaInicio,
            String fechaFin,
            ProgressReporter progress) throws IOException {
        SimulacionIterator iter = prepararIteradorRuteo(aeropuertosIS, vuelosIS, enviosFiles, escenario, fechaInicio,
                fechaFin, progress);
        List<RutaResponseDTO> chunks = new ArrayList<>();
        while (iter.hasNext() && !iter.hasColapsado()) {
            chunks.add(iter.nextChunk());
        }
        return chunks;
    }

    public SimulacionIterator prepararIteradorRuteo(InputStream aeropuertosIS,
            InputStream vuelosIS,
            List<MultipartFile> enviosFiles,
            int escenario,
            String fechaInicio,
            String fechaFin,
            ProgressReporter progress) throws IOException {

        report(progress, 8, "Cargando datos...");
        LOG.info("Cargando datos para el algoritmo...");

        if (escenario == 2 || escenario == 3) {
            cargaDatosService.resetAllRutasDefinidas();
        }

        Map<String, Aeropuerto> aeropuertos;
        if (aeropuertosIS != null) {
            aeropuertos = Parsers.parsearAeropuertos(aeropuertosIS);
        } else {
            aeropuertos = cargaDatosService.obtenerAeropuertosDeBDComoModelos();
        }

        List<Vuelo> vuelos;
        if (vuelosIS != null) {
            vuelos = Parsers.parsearVuelos(vuelosIS, aeropuertos);
        } else {
            vuelos = cargaDatosService.obtenerVuelosDeBDComoModelos(aeropuertos);
        }

        report(progress, 18, "Aeropuertos y vuelos cargados. Leyendo envios...");

        LocalDateTime inicioReal;
        if (escenario == 2 && (fechaInicio == null || fechaInicio.trim().isEmpty())) {
            inicioReal = LocalDateTime.now(java.time.ZoneOffset.UTC);
        } else {
            inicioReal = parsearFechaInicio(fechaInicio);
        }
        LocalDateTime finReal = parsearFechaFin(fechaFin);

        Map<String, Envio> enviosEnMemoria = null;

        if (enviosFiles != null && !enviosFiles.isEmpty()
                && !(enviosFiles.size() == 1 && enviosFiles.get(0).isEmpty())) {
            enviosEnMemoria = new LinkedHashMap<>();
            LocalDateTime inicioFiltro = fechaInicio != null ? inicioReal : null;
            LocalDateTime finFiltro = (escenario == 2 || escenario == 3) ? null : (fechaFin != null ? finReal : null);
            for (MultipartFile file : enviosFiles) {
                String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "_envios_XXXX_.txt";
                enviosEnMemoria.putAll(Parsers.parsearEnvios(file.getInputStream(), filename, aeropuertos, 0,
                        inicioFiltro, finFiltro));
            }
        }

        RedLogistica red = new RedLogistica(aeropuertos.values(), vuelos);
        report(progress, 35, "Red logistica construida.");

        ParametrosSimulacion paramsSim = obtenerParametrosSimulacion(escenario);

        RutaResponseDTO response = new RutaResponseDTO();
        response.setEscenario(escenario);
        response.setTotalVuelos(red.getTotalVuelos());
        response.setTotalEnviosCargados(0);
        response.setFechaInicio(fechaInicio);
        response.setFechaFin(fechaFin);
        response.setAeropuertos(
                aeropuertos.values().stream().map(this::mapAeropuertoDTO).collect(Collectors.toList()));
        response.setSa(paramsSim.getSa());
        response.setK(paramsSim.getK());

        int scMinutos = paramsSim.getScMinutos();

        report(progress, 98, "Preparando iterador para la simulación...");
        return new SimulacionUnificadaIterator(enviosEnMemoria, aeropuertos, vuelos, response, progress, inicioReal,
                finReal, scMinutos);
    }

    private void report(ProgressReporter progress, int pct, String message) {
        if (progress != null)
            progress.update(pct, message);
    }

    // AJUSTE: Agregamos el parámetro escenario para proteger el backlog del
    // Escenario 1
    private void retirarEnviosProcesados(Map<String, Envio> pendientes, SolucionEstado sol, int escenario) {
        for (String id : sol.getIdsAsignados())
            pendientes.remove(id);
        for (String id : sol.getIdsNoAceptados())
            pendientes.remove(id);

        // Si es Escenario 1, NO removemos los envíos sin ruta.
        // Se quedan en el almacén (backlog) para el siguiente lote.
        if (escenario != 1) {
            for (String id : sol.getEnviosSinRuta())
                pendientes.remove(id);
        }
    }

    private List<Vuelo> clonarVuelos(List<Vuelo> originales) {
        List<Vuelo> copia = new ArrayList<>();
        for (Vuelo v : originales)
            copia.add(v.clonar());
        return copia;
    }

    private NavigableMap<LocalDateTime, Map<String, Envio>> agruparEnviosPorLotePeriodo(Map<String, Envio> envios,
            int scMinutos) {
        NavigableMap<LocalDateTime, Map<String, Envio>> enviosPorLote = new TreeMap<>();
        for (Envio envio : ordenarEnviosCronologicamente(envios)) {
            LocalDateTime inicioLote = inicioLotePeriodo(envio.getFechaHoraRecepcion(), scMinutos);
            enviosPorLote.computeIfAbsent(inicioLote, k -> new LinkedHashMap<>()).put(envio.getId(), envio);
        }
        return enviosPorLote;
    }

    List<Map<String, Envio>> agruparEnviosEnLotesCincoMinutos(Collection<Envio> envios) {
        Map<String, Envio> enviosMap = new LinkedHashMap<>();
        for (Envio envio : envios)
            enviosMap.put(envio.getId(), envio);
        return new ArrayList<>(agruparEnviosPorLotePeriodo(enviosMap, 5).values());
    }

    private List<Envio> ordenarEnviosCronologicamente(Map<String, Envio> envios) {
        return envios.values().stream()
                .sorted(Comparator.comparing(Envio::getFechaHoraRecepcion).thenComparing(Envio::getId))
                .collect(Collectors.toList());
    }

    private LocalDateTime inicioLotePeriodo(LocalDateTime recepcion, int scMinutos) {
        LocalDateTime base = recepcion.truncatedTo(ChronoUnit.DAYS);
        long mins = ChronoUnit.MINUTES.between(base, recepcion);
        long loteMins = (mins / scMinutos) * scMinutos;
        return base.plusMinutes(loteMins);
    }

    Map<String, Envio> filtrarEnviosPorFecha(Map<String, Envio> envios, String fechaInicio, String fechaFin) {
        if (fechaInicio == null && fechaFin == null)
            return envios;
        LocalDateTime inicio = parsearFechaInicio(fechaInicio);
        LocalDateTime fin = parsearFechaFin(fechaFin);
        return envios.entrySet().stream()
                .filter(e -> {
                    LocalDateTime rec = e.getValue().getFechaHoraRecepcion();
                    return !rec.isBefore(inicio) && !rec.isAfter(fin);
                })
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
    }

    public LocalDateTime parsearFechaInicio(String fecha) {
        if (fecha == null)
            return LocalDateTime.of(1900, 1, 1, 0, 0);
        return parsearFechaParametro(fecha, false, LocalDateTime.of(1900, 1, 1, 0, 0));
    }

    public LocalDateTime parsearFechaFin(String fecha) {
        if (fecha == null)
            return LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        return parsearFechaParametro(fecha, true, LocalDateTime.of(2099, 12, 31, 23, 59, 59));
    }

    private LocalDateTime parsearFechaParametro(String fecha, boolean finDeDia, LocalDateTime fallback) {
        if (fecha == null || fecha.isBlank())
            return fallback;
        String valor = fecha.trim();
        try {
            if (valor.matches("\\d{12}")) {
                return LocalDateTime.parse(valor, FMT_FECHA_HORA);
            }
            if (valor.matches("\\d{8}")) {
                LocalDate dia = LocalDate.parse(valor, FMT_FECHA);
                return finDeDia ? dia.atTime(23, 59, 59) : dia.atStartOfDay();
            }
            return LocalDateTime.parse(valor);
        } catch (DateTimeParseException e) {
            return fallback;
        }
    }

    // ── ITERADOR UNIFICADO (DÍA A DÍA, PERIODO, COLAPSO) ─────────────────────────
    private void addVuelosMaestros(RutaResponseDTO chunk, List<Vuelo> vuelos) {
        chunk.setVuelosMaestros(vuelos.stream().map(v -> {
            RutaResponseDTO.TramoDTO t = new RutaResponseDTO.TramoDTO();
            t.setOrigen(v.getOrigen().getCodigo());
            t.setDestino(v.getDestino().getCodigo());
            t.setOrigenLat(v.getOrigen().getLatitud());
            t.setOrigenLon(v.getOrigen().getLongitud());
            t.setDestinoLat(v.getDestino().getLatitud());
            t.setDestinoLon(v.getDestino().getLongitud());
            t.setCapacidad(v.getCapacidadMax());
            t.setVueloId(v.getId());
            t.setHoraSalidaLocal(v.getHoraSalidaLocal().toString());
            t.setHoraLlegadaLocal(v.getHoraLlegadaLocal().toString());
            t.setSalidaMinutosGMT(v.getSalidaMinutosGMT());
            t.setLlegadaMinutosGMT(v.getLlegadaMinutosGMT());
            return t;
        }).collect(Collectors.toList()));
    }

    private class SimulacionUnificadaIterator implements SimulacionIterator {
        private final RedLogistica redSA;
        private final Map<String, Envio> pendientesSA = new LinkedHashMap<>();
        private final Map<String, List<SolucionEstado.OccupancyEvent>> reservasSA = new HashMap<>();
        private final RutaResponseDTO baseResponse;
        private final ProgressReporter progress;
        private final LocalDateTime fechaInicioRango;
        private final LocalDateTime fechaFinRango;
        private final LocalDate fechaInicioRangoDia;
        private final int scMinutos;
        private final List<Vuelo> vuelosOriginales;

        private final Map<String, Envio> enviosEnMemoria;
        private final Map<String, Aeropuerto> aeropuertosMap;
        private final Map<String, List<Vuelo>> rutasAsignadasGlobales = new LinkedHashMap<>();
        private final Map<String, Envio> enviosProcesadosOriginales = new HashMap<>();

        private LocalDateTime currentLoteInicio;
        private int loteCount = 0;
        private boolean colapsado = false;
        private String mensajeColapso = "";
        private boolean isFirst = true;
        private long totalMinutosSimulacion;
        private int enviosAcumuladosTotales = 0;

        public SimulacionUnificadaIterator(Map<String, Envio> enviosEnMemoria, Map<String, Aeropuerto> aeropuertosMap,
                List<Vuelo> vuelos, RutaResponseDTO baseResponse, ProgressReporter progress,
                LocalDateTime fechaInicioRango, LocalDateTime fechaFinRango, int scMinutos) {
            this.enviosEnMemoria = enviosEnMemoria;
            this.aeropuertosMap = aeropuertosMap;
            this.vuelosOriginales = vuelos;
            this.redSA = new RedLogistica(aeropuertosMap.values(), clonarVuelos(vuelos));
            this.baseResponse = baseResponse;
            this.progress = progress;
            this.fechaInicioRango = fechaInicioRango;
            this.fechaFinRango = fechaFinRango;
            this.fechaInicioRangoDia = fechaInicioRango.toLocalDate();
            this.scMinutos = scMinutos;
            this.currentLoteInicio = fechaInicioRango;

            if (fechaInicioRango != null && fechaFinRango != null) {
                this.totalMinutosSimulacion = Math.max(1, ChronoUnit.MINUTES.between(fechaInicioRango, fechaFinRango));
            } else {
                this.totalMinutosSimulacion = 1440;
            }
        }

        @Override
        public boolean hasNext() {
            if (colapsado)
                return false;
            if (baseResponse.getEscenario() == 1) {
                return currentLoteInicio.isBefore(fechaFinRango);
            }
            return true;
        }

        @Override
        public boolean hasColapsado() {
            return colapsado;
        }

        @Override
        public String getMensajeColapso() {
            return mensajeColapso;
        }

        @Override
        public RutaResponseDTO nextChunk() {
            if (!hasNext())
                return null;
            LocalDateTime loteFin = currentLoteInicio.plusMinutes(scMinutos);

            // 1. Fetch cancellations from DB and map to Set<String>
            Set<String> vuelosCanceladosKeys;
            if (baseResponse.getEscenario() == 1) {
                List<VueloCanceladoPeriodoEntity> dbCancellations = vueloCanceladoPeriodoRepository.findAll();
                vuelosCanceladosKeys = dbCancellations.stream()
                        .map(c -> c.getVuelo().getId() + ":" + c.getFecha().toString())
                        .collect(Collectors.toSet());
            } else if (baseResponse.getEscenario() == 3) {
                vuelosCanceladosKeys = Collections.emptySet();
            } else {
                List<VueloCanceladoEntity> dbCancellations = vueloCanceladoRepository.findAll();
                vuelosCanceladosKeys = dbCancellations.stream()
                        .map(c -> c.getVuelo().getId() + ":" + c.getFecha().toString())
                        .collect(Collectors.toSet());
            }

            // 2. Identify and re-route affected shipments
            List<String> enviosParaReencaminar = new ArrayList<>();
            for (Map.Entry<String, List<Vuelo>> entry : rutasAsignadasGlobales.entrySet()) {
                String envioId = entry.getKey();
                List<Vuelo> ruta = entry.getValue();

                Envio envio = enviosEnMemoria != null ? enviosEnMemoria.get(envioId)
                        : enviosProcesadosOriginales.get(envioId);
                if (envio == null)
                    continue;

                LocalDateTime t = envio.getRecepcionGMT();
                for (int i = 0; i < ruta.size(); i++) {
                    Vuelo v = ruta.get(i);
                    LocalDateTime proximaSalida = v.getProximaSalidaGMT(t, RedLogistica.BUFFER_CONEXION);
                    LocalDate fechaLocal = proximaSalida.plusHours(v.getOrigen().getGmt()).toLocalDate();
                    String key = v.getId() + ":" + fechaLocal.toString();

                    if (vuelosCanceladosKeys.contains(key)) {
                        enviosParaReencaminar.add(envioId);
                        break;
                    }
                    t = v.getLlegadaGMT(proximaSalida);
                }
            }

            for (String envioId : enviosParaReencaminar) {
                List<Vuelo> ruta = rutasAsignadasGlobales.get(envioId);
                Envio envio = enviosEnMemoria != null ? enviosEnMemoria.get(envioId)
                        : enviosProcesadosOriginales.get(envioId);
                if (ruta == null || envio == null)
                    continue;

                // Release capacity from all legs of the old route
                for (Vuelo v : ruta) {
                    v.liberar(envio.getCantidadMaletas());
                }

                // Find K index where the cancelled flight is
                int K = -1;
                LocalDateTime t = envio.getRecepcionGMT();
                LocalDateTime llegadaAnterior = envio.getRecepcionGMT();
                for (int i = 0; i < ruta.size(); i++) {
                    Vuelo v = ruta.get(i);
                    LocalDateTime proximaSalida = v.getProximaSalidaGMT(t, RedLogistica.BUFFER_CONEXION);
                    LocalDate fechaLocal = proximaSalida.plusHours(v.getOrigen().getGmt()).toLocalDate();
                    String key = v.getId() + ":" + fechaLocal.toString();

                    if (vuelosCanceladosKeys.contains(key)) {
                        K = i;
                        break;
                    }
                    llegadaAnterior = v.getLlegadaGMT(proximaSalida);
                    t = llegadaAnterior;
                }

                if (K != -1) {
                    Vuelo vueloCancelado = ruta.get(K);
                    Aeropuerto strandedAirport = vueloCancelado.getOrigen();

                    Envio envioCopia = new Envio(
                            envio.getId(),
                            envio.getIdCliente(),
                            strandedAirport,
                            envio.getDestino(),
                            llegadaAnterior,
                            envio.getCantidadMaletas());
                    envioCopia.setCustomDeadlineGMT(envio.getDeadlineGMT());

                    pendientesSA.put(envioId, envioCopia);

                    if (enviosEnMemoria != null) {
                        enviosEnMemoria.put(envioId, envioCopia);
                    } else {
                        enviosProcesadosOriginales.put(envioId, envioCopia);
                    }
                }
                rutasAsignadasGlobales.remove(envioId);
            }

            Map<String, Envio> nuevosEnvios = new LinkedHashMap<>();
            if (baseResponse.getEscenario() == 2) {
                nuevosEnvios = cargaDatosService.obtenerEnviosDiaADiaPendientes(aeropuertosMap, loteFin);
                if (!nuevosEnvios.isEmpty()) {
                    cargaDatosService.marcarEnviosComoProcesados(nuevosEnvios.keySet());
                }
            } else {
                if (enviosEnMemoria != null) {
                    for (Envio e : enviosEnMemoria.values()) {
                        LocalDateTime rec = e.getFechaHoraRecepcion();
                        if (!rec.isBefore(currentLoteInicio) && rec.isBefore(loteFin)) {
                            nuevosEnvios.put(e.getId(), e);
                        }
                    }
                } else {
                    nuevosEnvios = cargaDatosService.obtenerEnviosDeBDComoModelosEnRango(
                            aeropuertosMap, currentLoteInicio, loteFin.minusSeconds(1));
                }
            }

            pendientesSA.putAll(nuevosEnvios);
            enviosAcumuladosTotales += nuevosEnvios.size();
            loteCount++;

            RutaResponseDTO chunk = clonarBaseResponse(baseResponse, currentLoteInicio, loteFin);
            chunk.setTotalEnviosCargados(enviosAcumuladosTotales);

            SimulatedAnnealing sa = new SimulatedAnnealing(redSA)
                    .setTemperaturaInicial(1_000.0)
                    .setTemperaturaMinima(1.0)
                    .setTiempoPlanificacion(loteFin)
                    .setPeriodoString(formatoLote(currentLoteInicio, loteFin))
                    .setVuelosCanceladosKeys(vuelosCanceladosKeys);

            int pct = 35;
            if (baseResponse.getEscenario() == 1) {
                long minsPassed = ChronoUnit.MINUTES.between(fechaInicioRango, currentLoteInicio);
                pct = 35 + (int) ((60.0 * minsPassed) / totalMinutosSimulacion);
                pct = Math.min(95, Math.max(35, pct));
            }
            report(progress, pct, "SA lote: " + formatoLote(currentLoteInicio, loteFin));

            long t0 = System.currentTimeMillis();
            SolucionEstado solSA = sa.optimizar(pendientesSA);
            long msSA = System.currentTimeMillis() - t0;

            // Record global assignments
            for (Map.Entry<String, List<Vuelo>> e : solSA.getAsignaciones().entrySet()) {
                String envioId = e.getKey();
                List<Vuelo> ruta = e.getValue();
                if (!ruta.isEmpty()) {
                    rutasAsignadasGlobales.put(envioId, ruta);
                    if (enviosEnMemoria == null) {
                        Envio original = pendientesSA.get(envioId);
                        if (original != null) {
                            enviosProcesadosOriginales.put(envioId, original);
                        }
                    }
                }
            }

            List<Integer> currentCancelledIds = new ArrayList<>();
            Set<String> futureCancelledVuelosKeys = new HashSet<>();

            if (baseResponse.getEscenario() == 1) {
                List<VueloCanceladoPeriodoEntity> dbCancellations = vueloCanceladoPeriodoRepository.findAll();
                for (VueloCanceladoPeriodoEntity c : dbCancellations) {
                    if (c.getFecha().equals(currentLoteInicio.toLocalDate())) {
                        currentCancelledIds.add(c.getVuelo().getId().intValue());
                    }
                    if (c.getFecha().isEqual(fechaInicioRangoDia) || c.getFecha().isAfter(fechaInicioRangoDia)) {
                        futureCancelledVuelosKeys.add(c.getVuelo().getId() + ":" + c.getFecha().toString());
                    }
                }
            } else if (baseResponse.getEscenario() == 3) {
                // No cancellations for Collapse scenario
            } else {
                List<VueloCanceladoEntity> dbCancellations = vueloCanceladoRepository.findAll();
                for (VueloCanceladoEntity c : dbCancellations) {
                    if (c.getFecha().equals(currentLoteInicio.toLocalDate())) {
                        currentCancelledIds.add(c.getVuelo().getId().intValue());
                    }
                    if (c.getFecha().isEqual(fechaInicioRangoDia) || c.getFecha().isAfter(fechaInicioRangoDia)) {
                        futureCancelledVuelosKeys.add(c.getVuelo().getId() + ":" + c.getFecha().toString());
                    }
                }
            }

            String nombreAlgoritmo;
            if (baseResponse.getEscenario() == 3)
                nombreAlgoritmo = "SA (Colapso)";
            else if (baseResponse.getEscenario() == 2)
                nombreAlgoritmo = "SA (Día a Día)";
            else
                nombreAlgoritmo = "SA (Periodo)";

            chunk.setResultadoSA(buildResultado(nombreAlgoritmo, sa.getCostoInicial(), sa.getCostoFinal(),
                    sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solSA, pendientesSA,
                    currentCancelledIds, reservasSA, loteFin, fechaInicioRangoDia));

            // AJUSTE: Solo colapsamos en Escenario 3 (El Escenario 1 continúa operando
            // aunque haya varados)
            if (!solSA.getEnviosSinRuta().isEmpty() && baseResponse.getEscenario() == 3) {
                colapsado = true;
                mensajeColapso = "Algoritmo colapso: " + solSA.getEnviosSinRuta().size()
                        + " envios varados o SLA incumplido.";
                chunk.getResultadoSA().setMensajeColapso(mensajeColapso);
            }

            // AJUSTE: Pasamos el escenario para que retireEnviosProcesados pueda proteger
            // el backlog del esc. 1
            retirarEnviosProcesados(pendientesSA, solSA, baseResponse.getEscenario());

            if (isFirst) {
                addVuelosMaestros(chunk, vuelosOriginales);
                isFirst = false;
            }

            currentLoteInicio = loteFin;

            if (progress != null)
                progress.onChunk(chunk);
            return chunk;
        }

        @Override
        public int getSa() {
            return baseResponse.getSa();
        }

        @Override
        public int getK() {
            return baseResponse.getK();
        }

        @Override
        public int getEscenario() {
            return baseResponse.getEscenario();
        }

        @Override
        public LocalDateTime getCurrentTime() {
            return currentLoteInicio;
        }
    }

    // ── MAPEO A DTO ───────────────────────────────────────────────────────────
    private ResultadoAlgoritmo buildResultado(String nombre,
            double costoIni, double costoFin,
            double mejora, int iter, long ms,
            SolucionEstado sol,
            Map<String, Envio> envios,
            List<Integer> canceladosIds,
            Map<String, List<SolucionEstado.OccupancyEvent>> reservasAeropuerto,
            LocalDateTime tiempoPlanificacion,
            LocalDate fechaInicioRangoDia) {
        List<String> colapsados = sol.verificarCapacidadAeropuertos(reservasAeropuerto);
        int noAceptados = colapsados.size();

        // Add collapsed IDs to sol.idsNoAceptados just for getEnviosSinRuta
        // compatibility
        for (String c : colapsados) {
            if (!sol.getEnviosSinRuta().contains(c)) {
                sol.getEnviosSinRuta().add(c);
            }
        }

        double costoFinalAjustado = sol.evaluarCostoTotal();
        ResultadoAlgoritmo r = new ResultadoAlgoritmo();
        r.setAlgoritmo(nombre);
        r.setCostoInicial(costoIni);
        r.setCostoFinal(costoFinalAjustado);
        r.setMejoraRelativa(costoIni > 0 ? ((costoIni - costoFinalAjustado) / costoIni) * 100.0 : mejora);
        r.setIteraciones(iter);
        r.setTiempoEjecucionMs(ms);
        r.setEnviosAsignados(sol.getEnviosAsignados());
        r.setEnviosNoAceptados(noAceptados);
        r.setTotalEnvios(sol.getTotalEnvios());
        r.setMensajeColapso("");
        r.setVuelosCanceladosIds(canceladosIds);

        List<RutaMuestra> muestras = new ArrayList<>();
        int count = 0;
        for (Map.Entry<String, List<Vuelo>> e : sol.getAsignaciones().entrySet()) {
            if (count >= MAX_RUTAS_MUESTRA)
                break;
            Envio envio = envios.get(e.getKey());
            if (envio == null || e.getValue().isEmpty())
                continue;

            RutaMuestra rm = new RutaMuestra();
            rm.setEnvioId(envio.getId());
            rm.setOrigen(envio.getOrigen().getCodigo());
            rm.setDestino(envio.getDestino().getCodigo());
            rm.setMaletas(envio.getCantidadMaletas());
            rm.setSlaHoras(envio.getSlaHoras());
            LocalDateTime recepcionGMT = envio.getRecepcionGMT();
            rm.setRecepcionMinutosGMT(recepcionGMT.getHour() * 60 + recepcionGMT.getMinute());
            long recDia = ChronoUnit.DAYS.between(fechaInicioRangoDia, recepcionGMT.toLocalDate());
            rm.setRecepcionDiaOffset((int) recDia);

            LocalDateTime tiempoActual = (tiempoPlanificacion != null && tiempoPlanificacion.isAfter(recepcionGMT))
                    ? tiempoPlanificacion
                    : recepcionGMT;

            List<TramoDTO> tramos = new ArrayList<>();
            for (Vuelo v : e.getValue()) {
                LocalDateTime proximaSalida = v.getProximaSalidaGMT(tiempoActual, 30);
                LocalDateTime llegada = v.getLlegadaGMT(proximaSalida);
                tiempoActual = llegada;

                TramoDTO t = new TramoDTO();
                t.setOrigen(v.getOrigen().getCodigo());
                t.setDestino(v.getDestino().getCodigo());
                t.setOrigenLat(v.getOrigen().getLatitud());
                t.setOrigenLon(v.getOrigen().getLongitud());
                t.setDestinoLat(v.getDestino().getLatitud());
                t.setDestinoLon(v.getDestino().getLongitud());
                t.setCapacidad(v.getCapacidadMax());
                t.setVueloId(v.getId());
                t.setHoraSalidaLocal(v.getHoraSalidaLocal().toString());
                t.setHoraLlegadaLocal(v.getHoraLlegadaLocal().toString());

                t.setSalidaMinutosGMT(proximaSalida.getHour() * 60 + proximaSalida.getMinute());
                t.setLlegadaMinutosGMT(llegada.getHour() * 60 + llegada.getMinute());

                int diaSalida = (int) ChronoUnit.DAYS.between(fechaInicioRangoDia, proximaSalida.toLocalDate());
                t.setDiaOffset(diaSalida);
                tramos.add(t);
            }
            rm.setTramos(tramos);
            muestras.add(rm);
            count++;
        }

        r.setRutasMuestra(muestras);
        return r;
    }

    private RutaResponseDTO clonarBaseResponse(RutaResponseDTO base, LocalDate dia) {
        String fechaStr = dia.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        RutaResponseDTO c = new RutaResponseDTO();
        c.setEscenario(base.getEscenario());
        c.setTotalVuelos(base.getTotalVuelos());
        c.setAeropuertos(base.getAeropuertos());
        c.setFechaInicio(fechaStr);
        c.setFechaFin(fechaStr);
        c.setSa(base.getSa());
        c.setK(base.getK());
        return c;
    }

    private RutaResponseDTO clonarBaseResponse(RutaResponseDTO base, LocalDateTime loteInicio, LocalDateTime loteFin) {
        RutaResponseDTO c = clonarBaseResponse(base, loteInicio.toLocalDate());
        c.setLoteInicio(loteInicio.toString());
        c.setLoteFin(loteFin.toString());
        return c;
    }

    private String formatoLote(LocalDateTime loteInicio, LocalDateTime loteFin) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        return loteInicio.format(fmt) + " - " + loteFin.format(fmt);
    }

    private AeropuertoDTO mapAeropuertoDTO(Aeropuerto a) {
        AeropuertoDTO dto = new AeropuertoDTO();
        dto.setCodigo(a.getCodigo());
        dto.setCiudad(a.getCiudad());
        dto.setPais(a.getPais());
        dto.setContinente(a.getContinente());
        dto.setLatitud(a.getLatitud());
        dto.setLongitud(a.getLongitud());
        dto.setCapacidadMax(a.getCapacidadMax());
        dto.setGmt(a.getGmt());
        return dto;
    }
}