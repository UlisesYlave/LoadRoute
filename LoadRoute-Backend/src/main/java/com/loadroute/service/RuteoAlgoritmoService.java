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
import java.util.*;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * Servicio que orquesta el parsing de datos y la ejecución de algoritmos reales.
 * No depende de JPA/BD — todo en memoria desde los archivos subidos.
 */
@Service
public class RuteoAlgoritmoService {

    private static final Logger LOG = Logger.getLogger(RuteoAlgoritmoService.class.getName());

    /** Máximo de envíos a procesar por ejecución (para limitar tiempo). 0 = Ilimitado */
    private static final int LIMITE_ENVIOS = 0;

    /** Máximo de rutas de muestra en la respuesta. */
    private static final int MAX_RUTAS_MUESTRA = 10000;

    /**
     * Ejecuta el ruteo completo: parsea → construye grafo → ejecuta algoritmo(s).
     *
     * @param aeropuertosIS  InputStream del archivo de aeropuertos (UTF-16)
     * @param vuelosIS       InputStream del archivo de vuelos
     * @param enviosFiles    Lista de archivos de envíos subidos
     * @param escenario      1=Tiempo real (SA), 2=Periodo (SA vs ALNS), 3=Colapso
     * @return DTO con resultados completos
     */
    public RutaResponseDTO ejecutarRuteo(InputStream aeropuertosIS,
                                          InputStream vuelosIS,
                                          List<MultipartFile> enviosFiles,
                                          int escenario) throws IOException {
        // ── Reset de contador de IDs de vuelos ───────────────────────────
        Vuelo.resetContador();

        // ── 1. Parsear datos ─────────────────────────────────────────────
        LOG.info("Parseando archivos de datos...");
        Map<String, Aeropuerto> aeropuertos = Parsers.parsearAeropuertos(aeropuertosIS);
        List<Vuelo> vuelos = Parsers.parsearVuelos(vuelosIS, aeropuertos);
        
        Map<String, Envio> envios = new LinkedHashMap<>();
        for (MultipartFile file : enviosFiles) {
            String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "_envios_XXXX_.txt";
            Map<String, Envio> enviosMapeados = Parsers.parsearEnvios(
                    file.getInputStream(), filename, aeropuertos, LIMITE_ENVIOS);
            envios.putAll(enviosMapeados);
        }

        LOG.info(String.format("Datos cargados: %d aeropuertos, %d vuelos, %d envíos",
                aeropuertos.size(), vuelos.size(), envios.size()));

        // ── 2. Construir red logística ───────────────────────────────────
        RedLogistica red = new RedLogistica(aeropuertos.values(), vuelos);

        // ── 3. Construir respuesta base ──────────────────────────────────
        RutaResponseDTO response = new RutaResponseDTO();
        response.setEscenario(escenario);
        response.setTotalVuelos(red.getTotalVuelos());
        response.setTotalEnviosCargados(envios.size());

        // Mapear aeropuertos a DTO
        List<AeropuertoDTO> aeropuertoDTOs = aeropuertos.values().stream()
                .map(this::mapAeropuertoDTO)
                .collect(Collectors.toList());
        response.setAeropuertos(aeropuertoDTOs);

        // ── 4. Ejecutar escenario ────────────────────────────────────────
        switch (escenario) {
            case 1 -> ejecutarEscenario1(envios, red, response);
            case 2 -> ejecutarEscenario2(envios, red, response);
            case 3 -> ejecutarEscenario3(envios, vuelos, red, response);
            default -> ejecutarEscenario1(envios, red, response);
        }

        return response;
    }

    // ── Escenario 1: Tiempo Real (solo SA) ────────────────────────────────

    private void ejecutarEscenario1(Map<String, Envio> envios, RedLogistica red,
                                    RutaResponseDTO response) {
        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(1_000.0)
                .setAlfa(0.995)
                .setTemperaturaMinima(1.0)
                .setTiempoMaxMinutos(2); // 2 min para demo web

        long t0 = System.currentTimeMillis();
        SolucionEstado solucion = sa.optimizar(envios);
        long ms = System.currentTimeMillis() - t0;

        response.setResultadoSA(buildResultado("Simulated Annealing", sa.getCostoInicial(),
                sa.getCostoFinal(), sa.getMejoraRelativa(), sa.getIteraciones(), ms,
                solucion, envios));
    }

    // ── Escenario 2: Periodo (SA vs ALNS) ─────────────────────────────────

    private void ejecutarEscenario2(Map<String, Envio> envios, RedLogistica red,
                                    RutaResponseDTO response) {
        // SA
        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(1_000.0)
                .setAlfa(0.995)
                .setTemperaturaMinima(0.1)
                .setTiempoMaxMinutos(1);

        long t0 = System.currentTimeMillis();
        SolucionEstado solSA = sa.optimizar(envios);
        long msSA = System.currentTimeMillis() - t0;

        response.setResultadoSA(buildResultado("Simulated Annealing", sa.getCostoInicial(),
                sa.getCostoFinal(), sa.getMejoraRelativa(), sa.getIteraciones(), msSA,
                solSA, envios));

        // ALNS (parte de la solución SA como punto de partida)
        ALNS alns = new ALNS(red)
                .setMaxIteraciones(500)
                .setGradoDestruccion(0.25)
                .setTemperaturaInicial(200.0)
                .setTiempoMaxMinutos(1);

        long t1 = System.currentTimeMillis();
        SolucionEstado solALNS = alns.optimizar(envios, solSA.clonar());
        long msALNS = System.currentTimeMillis() - t1;

        response.setResultadoALNS(buildResultado("ALNS", alns.getCostoInicial(),
                alns.getCostoFinal(), alns.getMejoraRelativa(), alns.getIteraciones(), msALNS,
                solALNS, envios));
    }

    // ── Escenario 3: Colapso (SA + ALNS replanificación) ──────────────────

    private void ejecutarEscenario3(Map<String, Envio> envios, List<Vuelo> todosVuelos,
                                    RedLogistica red, RutaResponseDTO response) {
        // Paso 1: SA genera solución base perfecta
        SimulatedAnnealing sa = new SimulatedAnnealing(red)
                .setTemperaturaInicial(500.0)
                .setAlfa(0.99)
                .setTiempoMaxMinutos(1);

        long t0 = System.currentTimeMillis();
        SolucionEstado solColapso = sa.optimizar(envios);
        long msSA = System.currentTimeMillis() - t0;

        response.setResultadoSA(buildResultado("SA (Día Normal)", sa.getCostoInicial(),
                sa.getCostoFinal(), sa.getMejoraRelativa(), sa.getIteraciones(), msSA,
                solColapso, envios));

        // Paso 2: Bucle de Tortura Estructural (Prueba de Estrés)
        List<Vuelo> vuelosRestantes = new ArrayList<>(todosVuelos);
        // Desordenar para cancelar vuelos al azar
        Collections.shuffle(vuelosRestantes, new Random(42)); 

        ALNS alns = new ALNS(red)
                .setMaxIteraciones(300)
                .setGradoDestruccion(0.30)
                .setTemperaturaInicial(150.0)
                .setTiempoMaxMinutos(1);

        int totalVuelosInicial = todosVuelos.size();
        int vuelosCancelados = 0;
        boolean colapsado = false;
        String mensajeColapsoFinal = "";
        long t1 = System.currentTimeMillis();

        while (!colapsado && !vuelosRestantes.isEmpty()) {
            // Cancelar el 5% de la flota aeronáutica en cada ciclo
            int numACancelar = Math.max(1, (int)(totalVuelosInicial * 0.05));
            List<Vuelo> canceladosEstaRonda = new ArrayList<>();
            for (int i = 0; i < numACancelar && !vuelosRestantes.isEmpty(); i++) {
                canceladosEstaRonda.add(vuelosRestantes.remove(0));
            }
            vuelosCancelados += canceladosEstaRonda.size();

            // ALNS intenta salvar la empresa
            solColapso = alns.replanificarColapso(solColapso, canceladosEstaRonda, envios);

            // Verificar Colapso: Si más del 10% de los envíos quedan huérfanos sin ruta posible
            int huerfanos = solColapso.getEnviosSinRuta().size();
            double proporcionHuerfanos = (double) huerfanos / Math.max(1, envios.size());
            
            if (proporcionHuerfanos > 0.10) {
                colapsado = true;
                int porcentajePerdido = (int) (((double) vuelosCancelados / totalVuelosInicial) * 100);
                mensajeColapsoFinal = String.format("COLAPSO LOGÍSTICO ALCANZADO: %d envíos varados (%d%% del total) tras perder el %d%% de la flota mundial (%d vuelos).", 
                                                    huerfanos, (int)(proporcionHuerfanos * 100), porcentajePerdido, vuelosCancelados);
                LOG.warning(mensajeColapsoFinal);
                break;
            }
        }
        long msALNS = System.currentTimeMillis() - t1;

        if (!colapsado && vuelosRestantes.isEmpty()) {
            mensajeColapsoFinal = "Flota agotada por completo sin alcanzar límite de orfandad.";
        }

        // Paso 3: Guardar Resultado Final del Colapso
        ResultadoAlgoritmo resColapso = buildResultado("ALNS (Bucle de Colapso)", alns.getCostoInicial(),
                alns.getCostoFinal(), alns.getMejoraRelativa(), alns.getIteraciones(), msALNS,
                solColapso, envios);
        
        resColapso.setMensajeColapso(mensajeColapsoFinal);
        response.setResultadoALNS(resColapso);
    }

    // ── Utilidades de mapeo ───────────────────────────────────────────────

    private ResultadoAlgoritmo buildResultado(String nombre, double costoIni, double costoFin,
                                               double mejora, int iter, long ms,
                                               SolucionEstado sol, Map<String, Envio> envios) {
        ResultadoAlgoritmo r = new ResultadoAlgoritmo();
        r.setAlgoritmo(nombre);
        r.setCostoInicial(costoIni);
        r.setCostoFinal(costoFin);
        r.setMejoraRelativa(mejora);
        r.setIteraciones(iter);
        r.setTiempoEjecucionMs(ms);
        r.setEnviosAsignados(sol.getEnviosAsignados());
        r.setTotalEnvios(sol.getTotalEnvios());
        r.setMensajeColapso(""); // Por default

        // Muestra de rutas
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
