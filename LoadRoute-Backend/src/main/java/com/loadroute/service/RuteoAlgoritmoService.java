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
    public RutaResponseDTO ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario,
                                          String fechaInicio,
                                          String fechaFin) throws IOException {
        return ejecutarRuteo(aeropuertosIS, vuelosIS, enviosFiles, escenario, fechaInicio, fechaFin, null);
    }

    public RutaResponseDTO ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario,
                                          String fechaInicio,
                                          String fechaFin,
                                          ProgressReporter progress) throws IOException {
        report(progress, 8, "Parseando archivos de datos...");
        // ── 1. Reset de IDs de vuelos ────────────────────────────────────────
        Vuelo.resetContador();

        // ── 2. Parsear archivos de datos ─────────────────────────────────────
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
            return vacía;
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

        // ── 6. Ejecutar escenario ─────────────────────────────────────────────
        switch (escenario) {
            case 1 -> ejecutarEscenario1(envios, red, response, progress);
            case 2 -> ejecutarEscenario2(envios, red, response, progress);
            case 3 -> ejecutarEscenario3(envios, vuelos, red, response, progress);
            default -> ejecutarEscenario1(envios, red, response, progress);
        }

        report(progress, 98, "Preparando respuesta para el dashboard...");
        return response;
    }

    private void report(ProgressReporter progress, int pct, String message) {
        if (progress != null) progress.update(pct, message);
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

    private void ejecutarEscenario1(Map<String, Envio> envios, RedLogistica red,
                                    RutaResponseDTO response, ProgressReporter progress) {
        int envioCount = envios.size();
        // Tiempo proporcional al tamaño: mínimo 1 min, máximo 90 min
        long tiempoMin = Math.min(90L, Math.max(1L, envioCount / 150L));

        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(1_000.0)
                .setAlfa(0.995)
                .setTemperaturaMinima(1.0)
                .setTiempoMaxMinutos(tiempoMin);

        report(progress, 45, "Ejecutando Simulated Annealing...");
        long t0 = System.currentTimeMillis();
        SolucionEstado sol = sa.optimizar(envios);
        long ms = System.currentTimeMillis() - t0;
        report(progress, 88, "Simulated Annealing completado.");

        response.setResultadoSA(buildResultado("Simulated Annealing",
                sa.getCostoInicial(), sa.getCostoFinal(),
                sa.getMejoraRelativa(), sa.getIteraciones(), ms, sol, envios));
    }

    private void ejecutarEscenario2(Map<String, Envio> envios, RedLogistica red,
                                    RutaResponseDTO response, ProgressReporter progress) {
        int envioCount = envios.size();
        long tiempoMin = Math.min(45L, Math.max(1L, envioCount / 150L));

        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(1_000.0)
                .setAlfa(0.995)
                .setTemperaturaMinima(0.1)
                .setTiempoMaxMinutos(tiempoMin);

        report(progress, 42, "Ejecutando Simulated Annealing...");
        long t0 = System.currentTimeMillis();
        SolucionEstado solSA = sa.optimizar(envios);
        long msSA = System.currentTimeMillis() - t0;
        report(progress, 68, "SA completado. Ejecutando ALNS...");

        response.setResultadoSA(buildResultado("Simulated Annealing",
                sa.getCostoInicial(), sa.getCostoFinal(),
                sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solSA, envios));

        ALNS alns = new ALNS(red)
                .setMaxIteraciones(500)
                .setGradoDestruccion(0.25)
                .setTemperaturaInicial(200.0)
                .setTiempoMaxMinutos(tiempoMin);

        long t1 = System.currentTimeMillis();
        SolucionEstado solALNS = alns.optimizar(envios, solSA.clonar());
        long msALNS = System.currentTimeMillis() - t1;
        report(progress, 92, "ALNS completado.");

        response.setResultadoALNS(buildResultado("ALNS",
                alns.getCostoInicial(), alns.getCostoFinal(),
                alns.getMejoraRelativa(), alns.getIteraciones(), msALNS, solALNS, envios));
    }

    private void ejecutarEscenario3(Map<String, Envio> envios, List<Vuelo> todosVuelos,
                                    RedLogistica red, RutaResponseDTO response, ProgressReporter progress) {
        int envioCount = envios.size();
        long tiempoMin = Math.min(30L, Math.max(1L, envioCount / 200L));

        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(500.0)
                .setAlfa(0.99)
                .setTiempoMaxMinutos(tiempoMin);

        report(progress, 42, "Ejecutando SA para dia normal...");
        long t0 = System.currentTimeMillis();
        SolucionEstado solBase = sa.optimizar(envios);
        long msSA = System.currentTimeMillis() - t0;
        report(progress, 68, "SA completado. Simulando colapso con ALNS...");

        response.setResultadoSA(buildResultado("SA (Día Normal)",
                sa.getCostoInicial(), sa.getCostoFinal(),
                sa.getMejoraRelativa(), sa.getIteraciones(), msSA, solBase, envios));

        // Bucle de colapso progresivo
        List<Vuelo> vuelosRestantes = new ArrayList<>(todosVuelos);
        Collections.shuffle(vuelosRestantes, new Random(42));

        ALNS alns = new ALNS(red)
                .setMaxIteraciones(300)
                .setGradoDestruccion(0.30)
                .setTemperaturaInicial(150.0)
                .setTiempoMaxMinutos(tiempoMin);

        int totalVuelosInicial = todosVuelos.size();
        int vuelosCancelados = 0;
        boolean colapsado = false;
        String mensajeColapso = "";
        long t1 = System.currentTimeMillis();

        while (!colapsado && !vuelosRestantes.isEmpty()) {
            int numACancelar = Math.max(1, (int)(totalVuelosInicial * 0.05));
            List<Vuelo> cancelados = new ArrayList<>();
            for (int i = 0; i < numACancelar && !vuelosRestantes.isEmpty(); i++) {
                cancelados.add(vuelosRestantes.remove(0));
            }
            vuelosCancelados += cancelados.size();

            solBase = alns.replanificarColapso(solBase, cancelados, envios);

            int huerfanos = solBase.getEnviosSinRuta().size();
            double proporcion = (double) huerfanos / Math.max(1, envios.size());

            if (proporcion > 0.10) {
                colapsado = true;
                int pctFlota  = (int)((double) vuelosCancelados / totalVuelosInicial * 100);
                int pctHuerfa = (int)(proporcion * 100);
                mensajeColapso = String.format(
                    "COLAPSO LOGISTICO: %d envios varados (%d%% del total) tras perder el %d%% de la flota (%d vuelos cancelados).",
                    huerfanos, pctHuerfa, pctFlota, vuelosCancelados);
                LOG.warning(mensajeColapso);
            }
        }
        long msALNS = System.currentTimeMillis() - t1;
        report(progress, 92, "Replanificacion de colapso completada.");

        if (!colapsado) {
            mensajeColapso = "Flota agotada completamente sin alcanzar el umbral de colapso (10% de envios huerfanos).";
        }

        ResultadoAlgoritmo resColapso = buildResultado("ALNS (Colapso)",
                alns.getCostoInicial(), alns.getCostoFinal(),
                alns.getMejoraRelativa(), alns.getIteraciones(), msALNS, solBase, envios);
        resColapso.setMensajeColapso(mensajeColapso);
        response.setResultadoALNS(resColapso);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MAPEO A DTO
    // ══════════════════════════════════════════════════════════════════════════

    private ResultadoAlgoritmo buildResultado(String nombre,
                                               double costoIni, double costoFin,
                                               double mejora, int iter, long ms,
                                               SolucionEstado sol,
                                               Map<String, Envio> envios) {
        ResultadoAlgoritmo r = new ResultadoAlgoritmo();
        r.setAlgoritmo(nombre);
        r.setCostoInicial(costoIni);
        r.setCostoFinal(costoFin);
        r.setMejoraRelativa(mejora);
        r.setIteraciones(iter);
        r.setTiempoEjecucionMs(ms);
        r.setEnviosAsignados(sol.getEnviosAsignados());
        r.setTotalEnvios(sol.getTotalEnvios());
        r.setMensajeColapso("");

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
