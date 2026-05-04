package com.loadroute.service;

import com.loadroute.algorithm.*;
import com.loadroute.algorithm.graph.RedLogistica;
import com.loadroute.algorithm.model.*;
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
import java.util.*;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * Servicio principal de ruteo de Tasf.B2B.
 *
 * CAMBIO v3: Se añade filtrado de envíos por fecha para resolver el problema
 * de timeout del SA cuando el archivo contiene todos los envíos (238,202).
 *
 * ─── CORRECCIÓN RESPECTO AL PLAN ORIGINAL ────────────────────────────────────
 * El plan de Copilot filtraba usando envio.getRecepcionGMT() contra fechas locales.
 * Esto es INCORRECTO: getRecepcionGMT() ajusta la hora local por el GMT del aeropuerto.
 * Ejemplo: VIDP (India, GMT+5), envío 20260124-00:00 → GMT = 20260123T19:00.
 * Si el usuario escribe fechaInicio=20260124, busca envíos recibidos el 24 enero
 * EN EL AEROPUERTO (hora local), no a las 19:00 del 23 enero UTC.
 *
 * SOLUCIÓN CORRECTA: filtrar por getFechaHoraRecepcion() (hora LOCAL del aeropuerto).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Impacto del filtro con datos reales (_envios_VIDP_.txt):
 *   Rango del archivo: 2026-01-02 a 2029-01-05 (~238,202 envíos, ~3 años)
 *   Envíos por día:    ~216 envíos/día
 *   Sin filtro:        ~10+ minutos (greedy solo)
 *   Filtro 1 día:      ~200 envíos → greedy ~3 seg, SA converge en ~2 min ✅
 *   Filtro 1 semana:   ~1,500 envíos → greedy ~25 seg, SA converge en ~30 min ✅
 */
@Service
public class RuteoAlgoritmoService {

    private static final Logger LOG = Logger.getLogger(RuteoAlgoritmoService.class.getName());

    @FunctionalInterface
    public interface ProgressReporter {
        void update(int progress, String message);
        default void onChunk(RutaResponseDTO chunk) {}
    }

    /** Formato esperado para fechaInicio y fechaFin: YYYYMMDD */
    private static final DateTimeFormatter FMT_FECHA = DateTimeFormatter.ofPattern("yyyyMMdd");

    /** Máximo de rutas de muestra en la respuesta al frontend. */
    private static final int MAX_RUTAS_MUESTRA = 10_000;

    /**
     * Ejecuta el ruteo completo: parsea → filtra por fecha → construye grafo → ejecuta algoritmo.
     *
     * @param aeropuertosIS InputStream del archivo de aeropuertos (UTF-16 BE)
     * @param vuelosIS      InputStream del archivo de vuelos
     * @param enviosFiles   lista de archivos de envíos
     * @param escenario     1=tiempo real (SA), 2=periodo (SA vs ALNS), 3=colapso
     * @param fechaInicio   YYYYMMDD o null — filtra envíos desde esta fecha local (inclusive)
     * @param fechaFin      YYYYMMDD o null — filtra envíos hasta esta fecha local (inclusive)
     */
    public List<RutaResponseDTO> ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario,
                                          String fechaInicio,
                                          String fechaFin) throws IOException {
        return ejecutarRuteo(aeropuertosIS, vuelosIS, enviosFiles, escenario, fechaInicio, fechaFin, "ambos", null);
    }

    public List<RutaResponseDTO> ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario,
                                          String fechaInicio,
                                          String fechaFin,
                                          String algoritmos) throws IOException {
        return ejecutarRuteo(aeropuertosIS, vuelosIS, enviosFiles, escenario, fechaInicio, fechaFin, algoritmos, null);
    }

    public List<RutaResponseDTO> ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario,
                                          String fechaInicio,
                                          String fechaFin,
                                          String algoritmos,
                                          ProgressReporter progress) throws IOException {
        String seleccionAlgoritmos = normalizarAlgoritmos(algoritmos);
        report(progress, 8, "Parseando archivos de datos...");
        // ── 1. Parsear archivos de datos ─────────────────────────────────────
        LOG.info("Parseando archivos de datos...");
        Map<String, Aeropuerto> aeropuertos = Parsers.parsearAeropuertos(aeropuertosIS);
        List<Vuelo>             vuelos      = Parsers.parsearVuelos(vuelosIS, aeropuertos);
        report(progress, 18, "Aeropuertos y vuelos cargados. Leyendo envios...");

        Map<String, Envio> enviosCrudos = new LinkedHashMap<>();
        for (MultipartFile file : enviosFiles) {
            String filename = file.getOriginalFilename() != null
                    ? file.getOriginalFilename() : "_envios_XXXX_.txt";
            enviosCrudos.putAll(
                Parsers.parsearEnvios(file.getInputStream(), filename, aeropuertos, 0)
            );
        }

        // ── 3. Filtrar por fecha (HORA LOCAL del aeropuerto, no GMT) ─────────
        Map<String, Envio> envios = filtrarEnviosPorFecha(enviosCrudos, fechaInicio, fechaFin);
        report(progress, 30, String.format("Filtro aplicado: %d envios en el rango.", envios.size()));

        LOG.info(String.format(
            "Datos cargados: %d aeropuertos | %d vuelos | %d envíos totales → %d tras filtro [%s a %s]",
            aeropuertos.size(), vuelos.size(), enviosCrudos.size(), envios.size(),
            fechaInicio != null ? fechaInicio : "inicio",
            fechaFin    != null ? fechaFin    : "fin"
        ));

        if (envios.isEmpty()) {
            LOG.warning("No hay envíos para el rango de fechas especificado.");
            RutaResponseDTO vacía = new RutaResponseDTO();
            vacía.setEscenario(escenario);
            vacía.setTotalEnviosCargados(0);
            return Collections.singletonList(vacía);
        }

        // ── 4. Construir red logística ────────────────────────────────────────
        RedLogistica red = new RedLogistica(aeropuertos.values(), vuelos);
        report(progress, 35, "Red logistica construida.");

        // ── 5. Armar respuesta base ───────────────────────────────────────────
        RutaResponseDTO response = new RutaResponseDTO();
        response.setEscenario(escenario);
        response.setTotalVuelos(red.getTotalVuelos());
        response.setTotalEnviosCargados(envios.size());
        response.setFechaInicio(fechaInicio);
        response.setFechaFin(fechaFin);
        response.setAeropuertos(
            aeropuertos.values().stream().map(this::mapAeropuertoDTO).collect(Collectors.toList())
        );

        // ── 6. Agrupar envíos por día (Chunking) ──────────────────────────────
        Map<LocalDate, Map<String, Envio>> enviosPorDia = new TreeMap<>();
        for (Envio e : envios.values()) {
            LocalDate dia = e.getFechaHoraRecepcion().toLocalDate();
            enviosPorDia.computeIfAbsent(dia, k -> new LinkedHashMap<>()).put(e.getId(), e);
        }

        // ── 7. Ejecutar escenario ─────────────────────────────────────────────
        LocalDate fechaInicioRango = parsearFechaInicio(fechaInicio).toLocalDate();
        List<RutaResponseDTO> chunks = new ArrayList<>();
        switch (escenario) {
            case 1 -> chunks = ejecutarEscenario1(enviosPorDia, aeropuertos.values(), vuelos, response, progress, fechaInicioRango, seleccionAlgoritmos);
            case 2 -> chunks = ejecutarEscenario2(enviosPorDia, aeropuertos.values(), vuelos, response, progress, fechaInicioRango);
            case 3 -> chunks = ejecutarEscenario3(enviosPorDia, aeropuertos.values(), vuelos, response, progress, fechaInicioRango);
            default -> chunks = ejecutarEscenario1(enviosPorDia, aeropuertos.values(), vuelos, response, progress, fechaInicioRango, seleccionAlgoritmos);
        }

        if (!chunks.isEmpty()) {
            chunks.get(0).setVuelosMaestros(vuelos.stream().map(v -> {
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

        report(progress, 98, "Preparando respuesta para el dashboard...");
        return chunks;
    }

    private void report(ProgressReporter progress, int pct, String message) {
        if (progress != null) progress.update(pct, message);
    }

    private String normalizarAlgoritmos(String algoritmos) {
        if (algoritmos == null || algoritmos.isBlank()) return "ambos";
        String valor = algoritmos.trim().toLowerCase(Locale.ROOT);
        if (valor.equals("sa") || valor.equals("alns") || valor.equals("ambos")) return valor;
        LOG.warning("algoritmos invalido '" + algoritmos + "'. Valores esperados: sa, alns, ambos. Se usara ambos.");
        return "ambos";
    }

    private boolean ejecutarSA(String algoritmos) {
        return algoritmos.equals("sa") || algoritmos.equals("ambos");
    }

    private boolean ejecutarALNS(String algoritmos) {
        return algoritmos.equals("alns") || algoritmos.equals("ambos");
    }

    private void retirarEnviosProcesados(Map<String, Envio> pendientes, SolucionEstado sol) {
        for (String id : sol.getIdsAsignados()) pendientes.remove(id);
        for (String id : sol.getIdsNoAceptados()) pendientes.remove(id);
    }

    private List<Vuelo> clonarVuelos(List<Vuelo> originales) {
        List<Vuelo> copia = new ArrayList<>();
        for (Vuelo v : originales) {
            copia.add(v.clonar());
        }
        return copia;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FILTRADO POR FECHA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Filtra el mapa de envíos por rango de fechas.
     *
     * IMPORTANTE: La comparación se hace contra getFechaHoraRecepcion() (hora LOCAL
     * del aeropuerto origen), NO contra getRecepcionGMT().
     *
     * Razón: el usuario especifica fechas en términos del aeropuerto donde se recibió
     * la maleta. "Dame los envíos del 24 de enero en Delhi" significa las maletas
     * registradas ese día en Delhi hora local, independientemente de que sean
     * las 19:00 del 23 en UTC.
     *
     * @param envios      mapa completo de envíos parseados
     * @param fechaInicio YYYYMMDD o null (sin límite inferior)
     * @param fechaFin    YYYYMMDD o null (sin límite superior)
     * @return mapa filtrado (misma estructura, subconjunto de envíos)
     */
    Map<String, Envio> filtrarEnviosPorFecha(Map<String, Envio> envios,
                                              String fechaInicio,
                                              String fechaFin) {
        // Sin filtro: devolver todo
        if (fechaInicio == null && fechaFin == null) {
            return envios;
        }

        // Parsear fechas límite con hora de inicio/fin del día
        LocalDateTime inicio = parsearFechaInicio(fechaInicio);
        LocalDateTime fin    = parsearFechaFin(fechaFin);

        return envios.entrySet().stream()
            .filter(e -> {
                // CORRECTO: hora LOCAL del aeropuerto origen, no GMT
                LocalDateTime recepcionLocal = e.getValue().getFechaHoraRecepcion();
                return !recepcionLocal.isBefore(inicio) && !recepcionLocal.isAfter(fin);
            })
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                Map.Entry::getValue,
                (a, b) -> a,
                LinkedHashMap::new
            ));
    }

    /**
     * Parsea "YYYYMMDD" → LocalDateTime al inicio del día (00:00:00).
     * Si es null, devuelve el inicio del tiempo (sin límite inferior).
     */
    private LocalDateTime parsearFechaInicio(String fecha) {
        if (fecha == null) return LocalDateTime.of(1900, 1, 1, 0, 0);
        try {
            return LocalDate.parse(fecha, FMT_FECHA).atStartOfDay();
        } catch (DateTimeParseException e) {
            LOG.warning("fechaInicio inválida '" + fecha + "'. Formato esperado: YYYYMMDD. Se ignora.");
            return LocalDateTime.of(1900, 1, 1, 0, 0);
        }
    }

    /**
     * Parsea "YYYYMMDD" → LocalDateTime al final del día (23:59:59).
     * Si es null, devuelve el fin del tiempo (sin límite superior).
     */
    private LocalDateTime parsearFechaFin(String fecha) {
        if (fecha == null) return LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        try {
            return LocalDate.parse(fecha, FMT_FECHA).atTime(23, 59, 59);
        } catch (DateTimeParseException e) {
            LOG.warning("fechaFin inválida '" + fecha + "'. Formato esperado: YYYYMMDD. Se ignora.");
            return LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ESCENARIOS
    // ══════════════════════════════════════════════════════════════════════════

    private List<RutaResponseDTO> ejecutarEscenario1(Map<LocalDate, Map<String, Envio>> enviosPorDia,
                                    Collection<Aeropuerto> aeropuertos, List<Vuelo> vuelos,
                                    RutaResponseDTO baseResponse, ProgressReporter progress, LocalDate fechaInicioRango,
                                    String algoritmos) {
        // E1: Simulación de periodo limpia — SA vs ALNS sin cancelaciones
        boolean runSA = ejecutarSA(algoritmos);
        boolean runALNS = ejecutarALNS(algoritmos);
        List<Vuelo> vuelosSA = runSA ? clonarVuelos(vuelos) : Collections.emptyList();
        List<Vuelo> vuelosALNS = runALNS ? clonarVuelos(vuelos) : Collections.emptyList();
        RedLogistica redSA = runSA ? new RedLogistica(aeropuertos, vuelosSA) : null;
        RedLogistica redALNS = runALNS ? new RedLogistica(aeropuertos, vuelosALNS) : null;
        Map<String, Envio> pendientesSA = runSA ? new LinkedHashMap<>() : null;
        Map<String, Envio> pendientesALNS = runALNS ? new LinkedHashMap<>() : null;
        List<RutaResponseDTO> chunks = new ArrayList<>();
        int diaCount = 0, totalDias = enviosPorDia.size();

        for (Map.Entry<LocalDate, Map<String, Envio>> entry : enviosPorDia.entrySet()) {
            LocalDate dia = entry.getKey();
            if (runSA) pendientesSA.putAll(entry.getValue());
            if (runALNS) pendientesALNS.putAll(entry.getValue());
            diaCount++;
            int diaOffset = (int) fechaInicioRango.until(dia, java.time.temporal.ChronoUnit.DAYS);
            long tiempoMin = Math.min(15L, Math.max(1L, (runSA ? pendientesSA.size() : pendientesALNS.size()) / 150L));

            RutaResponseDTO chunk = clonarBaseResponse(baseResponse, dia);
            chunk.setTotalEnviosCargados(runSA ? pendientesSA.size() : pendientesALNS.size());
            if (runSA) {
                SimulatedAnnealing sa = new SimulatedAnnealing(redSA)
                        .setTemperaturaInicial(1_000.0).setAlfa(0.995)
                        .setTemperaturaMinima(1.0).setTiempoMaxMinutos(tiempoMin);
                report(progress, 35 + (25 * diaCount / totalDias), "E1-SA dia: " + dia);
                long t0 = System.currentTimeMillis();
                SolucionEstado solSA = sa.optimizar(pendientesSA);
                long msSA = System.currentTimeMillis() - t0;
                chunk.setResultadoSA(buildResultado("SA (Periodo)", sa.getCostoInicial(), sa.getCostoFinal(),
                        sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solSA, pendientesSA, diaOffset, Collections.emptyList()));
                retirarEnviosProcesados(pendientesSA, solSA);
            }
            if (runALNS) {
                ALNS alns = new ALNS(redALNS)
                        .setMaxIteraciones(500).setGradoDestruccion(0.25)
                        .setTemperaturaInicial(200.0).setTiempoMaxMinutos(tiempoMin);
                report(progress, 35 + (50 * diaCount / totalDias), "E1-ALNS dia: " + dia);
                long t1 = System.currentTimeMillis();
                SolucionEstado solALNS = alns.optimizarDesdeGreedy(pendientesALNS);
                long msALNS = System.currentTimeMillis() - t1;
                chunk.setResultadoALNS(buildResultado("ALNS (Periodo)", alns.getCostoInicial(), alns.getCostoFinal(),
                        alns.getMejoraRelativa(), alns.getIteraciones(), msALNS, solALNS, pendientesALNS, diaOffset, Collections.emptyList()));
                retirarEnviosProcesados(pendientesALNS, solALNS);
            }
            chunks.add(chunk);
            if (progress != null) progress.onChunk(chunk);
        }
        return chunks;
    }

    private RutaResponseDTO clonarBaseResponse(RutaResponseDTO base, LocalDate dia) {
        // Formato YYYYMMDD para que el frontend parsee correctamente
        String fechaStr = dia.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        RutaResponseDTO c = new RutaResponseDTO();
        c.setEscenario(base.getEscenario());
        c.setTotalVuelos(base.getTotalVuelos());
        c.setAeropuertos(base.getAeropuertos());
        c.setFechaInicio(fechaStr);
        c.setFechaFin(fechaStr);
        return c;
    }

    private List<RutaResponseDTO> ejecutarEscenario2(Map<LocalDate, Map<String, Envio>> enviosPorDia,
                                    Collection<Aeropuerto> aeropuertos, List<Vuelo> vuelos,
                                    RutaResponseDTO baseResponse, ProgressReporter progress, LocalDate fechaInicioRango) {
        // E2: Operación día a día — cancelación leve 1%/día, SA vs ALNS
        List<Vuelo> vuelosSA   = clonarVuelos(vuelos);
        List<Vuelo> vuelosALNS = clonarVuelos(vuelos);
        List<Vuelo> disponiblesSA   = new ArrayList<>(vuelosSA);
        List<Vuelo> disponiblesALNS = new ArrayList<>(vuelosALNS);
        Collections.shuffle(disponiblesSA,   new Random(123));
        Collections.shuffle(disponiblesALNS, new Random(123));
        Set<Integer> canceladosAcumulados = new HashSet<>();
        Map<String, Envio> pendientesSA   = new LinkedHashMap<>();
        Map<String, Envio> pendientesALNS = new LinkedHashMap<>();
        List<RutaResponseDTO> chunks = new ArrayList<>();
        int diaCount = 0, totalDias = enviosPorDia.size();

        for (Map.Entry<LocalDate, Map<String, Envio>> entry : enviosPorDia.entrySet()) {
            LocalDate dia = entry.getKey();
            pendientesSA.putAll(entry.getValue());
            pendientesALNS.putAll(entry.getValue());
            diaCount++;
            int diaOffset = (int) fechaInicioRango.until(dia, java.time.temporal.ChronoUnit.DAYS);
            // Cancelar 1% de la flota cada día (capacidad → 0)
            int cancelar = Math.max(1, (int)(vuelos.size() * 0.01));
            for (int i = 0; i < cancelar && !disponiblesSA.isEmpty(); i++) {
                Vuelo vsa = disponiblesSA.remove(0);
                vsa.setCapacidadMax(0);
                Vuelo valns = disponiblesALNS.remove(0);
                valns.setCapacidadMax(0);
                canceladosAcumulados.add(vsa.getId());
            }
            long tiempoMin = Math.min(10L, Math.max(1L, pendientesSA.size() / 150L));

            SimulatedAnnealing sa = new SimulatedAnnealing(new RedLogistica(aeropuertos, vuelosSA))
                    .setTemperaturaInicial(1_000.0).setAlfa(0.995)
                    .setTemperaturaMinima(0.1).setTiempoMaxMinutos(tiempoMin);
            report(progress, 35 + (25 * diaCount / totalDias), "E2-SA dia: " + dia);
            long t0 = System.currentTimeMillis();
            SolucionEstado solSA = sa.optimizar(pendientesSA);
            long msSA = System.currentTimeMillis() - t0;

            ALNS alns = new ALNS(new RedLogistica(aeropuertos, vuelosALNS))
                    .setMaxIteraciones(500).setGradoDestruccion(0.25)
                    .setTemperaturaInicial(200.0).setTiempoMaxMinutos(tiempoMin);
            report(progress, 35 + (50 * diaCount / totalDias), "E2-ALNS dia: " + dia);
            long t1 = System.currentTimeMillis();
            SolucionEstado solALNS = alns.optimizarDesdeGreedy(pendientesALNS);
            long msALNS = System.currentTimeMillis() - t1;

            RutaResponseDTO chunk = clonarBaseResponse(baseResponse, dia);
            chunk.setTotalEnviosCargados(pendientesSA.size());
            List<Integer> idsCanceladosList = new ArrayList<>(canceladosAcumulados);
            chunk.setResultadoSA(buildResultado("SA (Dia a Dia)",
                    sa.getCostoInicial(), sa.getCostoFinal(),
                    sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solSA, pendientesSA, diaOffset, idsCanceladosList));
            chunk.setResultadoALNS(buildResultado("ALNS (Dia a Dia)",
                    alns.getCostoInicial(), alns.getCostoFinal(),
                    alns.getMejoraRelativa(), alns.getIteraciones(), msALNS, solALNS, pendientesALNS, diaOffset, idsCanceladosList));

            chunks.add(chunk);
            if (progress != null) progress.onChunk(chunk);

            retirarEnviosProcesados(pendientesSA, solSA);
            retirarEnviosProcesados(pendientesALNS, solALNS);
        }
        return chunks;
    }

    private List<RutaResponseDTO> ejecutarEscenario3(Map<LocalDate, Map<String, Envio>> enviosPorDia,
                                    Collection<Aeropuerto> aeropuertos, List<Vuelo> vuelos,
                                    RutaResponseDTO baseResponse, ProgressReporter progress, LocalDate fechaInicioRango) {
        // E3: Colapso progresivo 5%/día — SA vs ALNS bajo el mismo estrés de red
        List<Vuelo> vuelosSA   = clonarVuelos(vuelos);
        List<Vuelo> vuelosALNS = clonarVuelos(vuelos);
        List<Vuelo> restantesSA   = new ArrayList<>(vuelosSA);
        List<Vuelo> restantesALNS = new ArrayList<>(vuelosALNS);
        Collections.shuffle(restantesSA,   new Random(42));
        Collections.shuffle(restantesALNS, new Random(42));
        Set<Integer> canceladosSA   = new HashSet<>();
        Set<Integer> canceladosALNS = new HashSet<>();
        Map<String, Envio> pendientesSA   = new LinkedHashMap<>();
        Map<String, Envio> pendientesALNS = new LinkedHashMap<>();
        List<RutaResponseDTO> chunks = new ArrayList<>();
        int diaCount = 0, totalDias = enviosPorDia.size();
        int totalVuelos = vuelos.size(), canceladosTotal = 0;
        boolean colapsado = false;
        String mensajeColapso = "";

        for (Map.Entry<LocalDate, Map<String, Envio>> entry : enviosPorDia.entrySet()) {
            LocalDate dia = entry.getKey();
            pendientesSA.putAll(entry.getValue());
            pendientesALNS.putAll(entry.getValue());
            diaCount++;
            int diaOffset = (int) fechaInicioRango.until(dia, java.time.temporal.ChronoUnit.DAYS);
            // Cancelar 5% acumulativo
            if (!colapsado) {
                int n = Math.max(1, (int)(totalVuelos * 0.05));
                for (int i = 0; i < n && !restantesSA.isEmpty(); i++) {
                    Vuelo vs = restantesSA.remove(0);
                    Vuelo va = restantesALNS.remove(0);
                    canceladosSA.add(vs.getId());
                    canceladosALNS.add(va.getId());
                    canceladosTotal++;
                }
            }
            long tiempoMin = Math.min(10L, Math.max(1L, pendientesSA.size() / 200L));

            SimulatedAnnealing sa = new SimulatedAnnealing(new RedLogistica(aeropuertos, vuelosSA))
                    .setTemperaturaInicial(800.0).setAlfa(0.99)
                    .setTemperaturaMinima(0.5).setTiempoMaxMinutos(tiempoMin);
            report(progress, 35 + (25 * diaCount / totalDias), "E3-SA dia: " + dia);
            long t0 = System.currentTimeMillis();
            SolucionEstado solSA = sa.optimizar(pendientesSA);
            long msSA = System.currentTimeMillis() - t0;

            ALNS alns = new ALNS(new RedLogistica(aeropuertos, vuelosALNS))
                    .setMaxIteraciones(300).setGradoDestruccion(0.30)
                    .setTemperaturaInicial(150.0).setTiempoMaxMinutos(tiempoMin);
            report(progress, 35 + (50 * diaCount / totalDias), "E3-ALNS dia: " + dia);
            long t1 = System.currentTimeMillis();
            SolucionEstado solALNS = alns.optimizarDesdeGreedy(pendientesALNS, canceladosALNS);
            long msALNS = System.currentTimeMillis() - t1;

            int huerfanos = solALNS.getEnviosSinRuta().size();
            double proporcion = (double) huerfanos / Math.max(1, pendientesALNS.size());
            if (proporcion > 0.10 && !colapsado) {
                colapsado = true;
                int pctFlota  = (int)((double) canceladosTotal / totalVuelos * 100);
                int pctHuerfa = (int)(proporcion * 100);
                mensajeColapso = String.format("COLAPSO: %d envios varados (%d%%) tras perder %d%% flota.",
                        huerfanos, pctHuerfa, pctFlota);
            }

            RutaResponseDTO chunk = clonarBaseResponse(baseResponse, dia);
            chunk.setTotalEnviosCargados(pendientesSA.size());
            List<Integer> idsCanceladosSA = new ArrayList<>(canceladosSA);
            List<Integer> idsCanceladosALNS = new ArrayList<>(canceladosALNS);
            chunk.setResultadoSA(buildResultado("SA (Colapso)", sa.getCostoInicial(), sa.getCostoFinal(),
                    sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solSA, pendientesSA, diaOffset, idsCanceladosSA));
            ResultadoAlgoritmo resALNS = buildResultado("ALNS (Colapso)", alns.getCostoInicial(), alns.getCostoFinal(),
                    alns.getMejoraRelativa(), alns.getIteraciones(), msALNS, solALNS, pendientesALNS, diaOffset, idsCanceladosALNS);
            resALNS.setMensajeColapso(mensajeColapso);
            chunk.setResultadoALNS(resALNS);
            chunks.add(chunk);
            if (progress != null) progress.onChunk(chunk);

            retirarEnviosProcesados(pendientesSA, solSA);
            retirarEnviosProcesados(pendientesALNS, solALNS);
        }
        return chunks;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MAPEO A DTO
    // ══════════════════════════════════════════════════════════════════════════

    private ResultadoAlgoritmo buildResultado(String nombre,
                                               double costoIni, double costoFin,
                                               double mejora, int iter, long ms,
                                               SolucionEstado sol,
                                               Map<String, Envio> envios,
                                               int diaOffset,
                                               List<Integer> canceladosIds) {
        int noAceptados = sol.aplicarRestriccionCapacidadAeropuertos();
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
            if (count >= MAX_RUTAS_MUESTRA) break;
            Envio envio = envios.get(e.getKey());
            if (envio == null || e.getValue().isEmpty()) continue;

            RutaMuestra rm = new RutaMuestra();
            rm.setEnvioId(envio.getId());
            rm.setOrigen(envio.getOrigen().getCodigo());
            rm.setDestino(envio.getDestino().getCodigo());
            rm.setMaletas(envio.getCantidadMaletas());
            rm.setSlaHoras(envio.getSlaHoras());

            List<TramoDTO> tramos = new ArrayList<>();
            for (Vuelo v : e.getValue()) {
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
                t.setSalidaMinutosGMT(v.getSalidaMinutosGMT());
                t.setLlegadaMinutosGMT(v.getLlegadaMinutosGMT());
                t.setDiaOffset(diaOffset);
                tramos.add(t);
            }
            rm.setTramos(tramos);
            muestras.add(rm);
            count++;
        }
        r.setRutasMuestra(muestras);
        return r;
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
