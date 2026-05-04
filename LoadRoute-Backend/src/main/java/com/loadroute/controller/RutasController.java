package com.loadroute.controller;

import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.dto.SimulacionJobDTO;
import com.loadroute.service.RuteoAsyncJobService;
import com.loadroute.service.RuteoAlgoritmoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * Controlador REST para los endpoints de ruteo de Tasf.B2B.
 *
 * CAMBIO v3: Se añaden parámetros opcionales de filtro de fecha (fechaInicio, fechaFin)
 * para resolver el problema de timeout del SA con archivos de 238,202 envíos.
 *
 * Endpoint principal:
 *   POST /api/rutas/simular
 *
 * Parámetros de archivo (multipart):
 *   aeropuertosFile  — catálogo de aeropuertos (UTF-16 BE)
 *   vuelosFile       — planes de vuelo
 *   enviosFiles      — uno o más archivos _envios_XXXX_.txt
 *
 * Parámetros de query:
 *   escenario        — 1 (tiempo real), 2 (periodo), 3 (colapso), 4 (rolling horizon). Default: 1
 *   fechaInicio      — YYYYMMDD. Filtra envíos desde esta fecha (inclusive). Opcional.
 *   fechaFin         — YYYYMMDD. Filtra envíos hasta esta fecha (inclusive). Opcional.
 *
 * Ejemplos de uso:
 *   Sin filtro (TODOS los envíos):
 *     POST /api/rutas/simular?escenario=1
 *     → Puede tardar 10+ minutos con archivos grandes.
 *
 *   Un día específico (~200 envíos):
 *     POST /api/rutas/simular?escenario=1&fechaInicio=20260102&fechaFin=20260102
 *     → Greedy ~3-5 seg, SA converge en ~2 min.
 *
 *   Una semana (~1,500 envíos):
 *     POST /api/rutas/simular?escenario=2&fechaInicio=20260102&fechaFin=20260108
 *     → Greedy ~30 seg, SA+ALNS convergen en 45 min cada uno.
 */
@RestController
@RequestMapping("/api/rutas")
@CrossOrigin(origins = "*")
public class RutasController {

    private final RuteoAlgoritmoService ruteoService;
    private final RuteoAsyncJobService asyncJobService;

    public RutasController(RuteoAlgoritmoService ruteoService, RuteoAsyncJobService asyncJobService) {
        this.ruteoService = ruteoService;
        this.asyncJobService = asyncJobService;
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }

    /**
     * Endpoint principal de simulación de ruteo.
     *
     * @param aeropuertosFile archivo de catálogo de aeropuertos (UTF-16 BE)
     * @param vuelosFile      archivo de planes de vuelo
     * @param enviosFiles     lista de archivos de envíos (_envios_XXXX_.txt)
     * @param escenario       1=tiempo real, 2=periodo, 3=colapso, 4=rolling horizon
     * @param fechaInicio     YYYYMMDD — filtrar envíos desde esta fecha (hora local del aeropuerto)
     * @param fechaFin        YYYYMMDD — filtrar envíos hasta esta fecha (hora local del aeropuerto)
     * @return DTO con resultados de los algoritmos
     */
    @PostMapping("/simular")
    public ResponseEntity<RutaResponseDTO> simular(
            @RequestPart("aeropuertosFile") MultipartFile aeropuertosFile,
            @RequestPart("vuelosFile")      MultipartFile vuelosFile,
            @RequestPart("enviosFiles")     List<MultipartFile> enviosFiles,
            @RequestParam(value = "escenario",   defaultValue = "1") int escenario,
            @RequestParam(value = "fechaInicio", required = false)    String fechaInicio,
            @RequestParam(value = "fechaFin",    required = false)    String fechaFin
    ) throws IOException {

        RutaResponseDTO response = ruteoService.ejecutarRuteo(
                aeropuertosFile.getInputStream(),
                vuelosFile.getInputStream(),
                enviosFiles,
                escenario,
                fechaInicio,
                fechaFin
        );

        return ResponseEntity.ok(response);
    }

    @PostMapping("/simular-async")
    public ResponseEntity<SimulacionJobDTO> simularAsync(
            @RequestPart("aeropuertosFile") MultipartFile aeropuertosFile,
            @RequestPart("vuelosFile")      MultipartFile vuelosFile,
            @RequestPart("enviosFiles")     List<MultipartFile> enviosFiles,
            @RequestParam(value = "escenario",   defaultValue = "1") int escenario,
            @RequestParam(value = "fechaInicio", required = false)    String fechaInicio,
            @RequestParam(value = "fechaFin",    required = false)    String fechaFin
    ) throws IOException {
        return ResponseEntity.ok(asyncJobService.iniciar(
                aeropuertosFile,
                vuelosFile,
                enviosFiles,
                escenario,
                fechaInicio,
                fechaFin
        ));
    }

    @GetMapping("/simular-async/{jobId}")
    public ResponseEntity<SimulacionJobDTO> estadoSimulacion(@PathVariable String jobId) {
        SimulacionJobDTO job = asyncJobService.obtener(jobId);
        return job != null ? ResponseEntity.ok(job) : ResponseEntity.notFound().build();
    }
}
