package com.loadroute.controller;

import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.dto.SimulacionJobDTO;
import com.loadroute.service.CargaDatosService;
import com.loadroute.service.RuteoAsyncJobService;
import com.loadroute.service.RuteoAlgoritmoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Controlador REST para los endpoints de ruteo de Tasf.B2B.
 * Todos los escenarios usan Simulated Annealing (SA).
 */
@RestController
@RequestMapping("/api/rutas")
@CrossOrigin(origins = "*")
public class RutasController {

    private final RuteoAlgoritmoService ruteoService;
    private final RuteoAsyncJobService asyncJobService;
    private final CargaDatosService cargaDatosService;

    public RutasController(RuteoAlgoritmoService ruteoService,
                           RuteoAsyncJobService asyncJobService,
                           CargaDatosService cargaDatosService) {
        this.ruteoService = ruteoService;
        this.asyncJobService = asyncJobService;
        this.cargaDatosService = cargaDatosService;
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }

    @PostMapping("/simular")
    public ResponseEntity<List<RutaResponseDTO>> simular(
            @RequestPart(value = "aeropuertosFile", required = false) MultipartFile aeropuertosFile,
            @RequestPart(value = "vuelosFile", required = false)      MultipartFile vuelosFile,
            @RequestPart(value = "enviosFiles", required = false)     List<MultipartFile> enviosFiles,
            @RequestParam(value = "escenario",   defaultValue = "1") int escenario,
            @RequestParam(value = "fechaInicio", required = false)    String fechaInicio,
            @RequestParam(value = "fechaFin",    required = false)    String fechaFin,
            @RequestParam(value = "tiempoEsperaEscala",  required = false) Integer tiempoEsperaEscala,
            @RequestParam(value = "tiempoEsperaDestino", required = false) Integer tiempoEsperaDestino,
            @RequestParam(value = "sa",          required = false) Integer sa,
            @RequestParam(value = "k",           required = false) Integer k
    ) throws IOException {
        procesarArchivos(aeropuertosFile, vuelosFile, enviosFiles);
        validarDatos();

        List<RutaResponseDTO> response = ruteoService.ejecutarRuteo(
                null,
                null,
                null,
                escenario,
                fechaInicio,
                fechaFin,
                tiempoEsperaEscala,
                tiempoEsperaDestino,
                sa,
                k
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/simular-async")
    public ResponseEntity<SimulacionJobDTO> simularAsync(
            @RequestPart(value = "aeropuertosFile", required = false) MultipartFile aeropuertosFile,
            @RequestPart(value = "vuelosFile", required = false)      MultipartFile vuelosFile,
            @RequestPart(value = "enviosFiles", required = false)     List<MultipartFile> enviosFiles,
            @RequestParam(value = "escenario",   defaultValue = "1") int escenario,
            @RequestParam(value = "fechaInicio", required = false)    String fechaInicio,
            @RequestParam(value = "fechaFin",    required = false)    String fechaFin,
            @RequestParam(value = "tiempoEsperaEscala",  required = false) Integer tiempoEsperaEscala,
            @RequestParam(value = "tiempoEsperaDestino", required = false) Integer tiempoEsperaDestino,
            @RequestParam(value = "sa",          required = false) Integer sa,
            @RequestParam(value = "k",           required = false) Integer k,
            @RequestHeader(value = "X-Session-ID", required = false)  String sessionId
    ) throws IOException {
        procesarArchivos(aeropuertosFile, vuelosFile, enviosFiles);
        validarDatos();

        return ResponseEntity.ok(asyncJobService.iniciar(
                escenario,
                fechaInicio,
                fechaFin,
                tiempoEsperaEscala,
                tiempoEsperaDestino,
                sa,
                k,
                sessionId
        ));
    }

    @GetMapping("/simular-async/active")
    public ResponseEntity<Map<Integer, SimulacionJobDTO>> trabajosActivos() {
        return ResponseEntity.ok(asyncJobService.obtenerTrabajosActivos());
    }

    @GetMapping("/simular-async/{jobId}")
    public ResponseEntity<SimulacionJobDTO> estadoSimulacion(@PathVariable String jobId) {
        SimulacionJobDTO job = asyncJobService.obtenerEstado(jobId);
        return job != null ? ResponseEntity.ok(job) : ResponseEntity.notFound().build();
    }

    @GetMapping("/simular-async/{jobId}/chunks")
    public ResponseEntity<SimulacionJobDTO> chunksSimulacion(
            @PathVariable String jobId,
            @RequestParam(value = "desde", defaultValue = "0") int desde
    ) {
        SimulacionJobDTO job = asyncJobService.obtenerChunks(jobId, desde);
        return job != null ? ResponseEntity.ok(job) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/simular-async/{jobId}")
    public ResponseEntity<Void> eliminarSimulacion(
            @PathVariable String jobId,
            @RequestHeader(value = "X-Session-ID", required = false) String sessionId
    ) {
        SimulacionJobDTO job = asyncJobService.obtenerEstado(jobId);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }
        if (job.getOwner() != null && !job.getOwner().equals(sessionId)) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build();
        }
        asyncJobService.eliminar(jobId, sessionId);
        return ResponseEntity.noContent().build();
    }

    // ── Métodos Auxiliares para el procesamiento de archivos ──────────────────

    private void procesarArchivos(MultipartFile aeropuertosFile,
                                  MultipartFile vuelosFile,
                                  List<MultipartFile> enviosFiles) throws IOException {
        if (isFilePresent(aeropuertosFile)) {
            cargaDatosService.guardarOReemplazarAeropuertos(aeropuertosFile.getInputStream());
        }
        if (isFilePresent(vuelosFile)) {
            cargaDatosService.guardarOReemplazarVuelos(vuelosFile.getInputStream());
        }
        if (isFileListPresent(enviosFiles)) {
            cargaDatosService.guardarOReemplazarEnvios(enviosFiles);
        }
    }

    private void validarDatos() {
        if (!cargaDatosService.tieneAeropuertos()) {
            throw new IllegalArgumentException("No hay aeropuertos registrados en la base de datos y no se subió ningún archivo.");
        }
        if (!cargaDatosService.tieneVuelos()) {
            throw new IllegalArgumentException("No hay vuelos registrados en la base de datos y no se subió ningún archivo.");
        }
        if (!cargaDatosService.tieneEnvios()) {
            throw new IllegalArgumentException("No hay envíos registrados en la base de datos y no se subió ningún archivo.");
        }
    }

    private boolean isFilePresent(MultipartFile file) {
        return file != null && !file.isEmpty() && file.getOriginalFilename() != null && !file.getOriginalFilename().trim().isEmpty();
    }

    private boolean isFileListPresent(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) return false;
        for (MultipartFile file : files) {
            if (isFilePresent(file)) return true;
        }
        return false;
    }

    // ── Manejador de Excepciones ──────────────────────────────────────────────

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<java.util.Map<String, String>> handleIllegalArgumentException(IllegalArgumentException ex) {
        // Imprime un mensaje claro y visible en la consola del backend
        System.err.println("\n[ERROR DE VALIDACIÓN] No hay datos para simular: " + ex.getMessage() + "\n");
        
        // Retorna un JSON limpio a Postman con código 400 Bad Request en lugar de 500
        java.util.Map<String, String> errorResponse = new java.util.HashMap<>();
        errorResponse.put("error", "No hay datos para simular");
        errorResponse.put("detalle", ex.getMessage());
        
        return ResponseEntity.badRequest().body(errorResponse);
    }
}
