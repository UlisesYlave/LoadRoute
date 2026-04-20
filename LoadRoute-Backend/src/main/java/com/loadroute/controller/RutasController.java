package com.loadroute.controller;

import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.service.RuteoAlgoritmoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * Controlador REST para el sistema de ruteo LoadRoute.
 *
 * Endpoints:
 *   POST /api/rutas/simular  — Sube 3 archivos .txt y ejecuta el escenario elegido
 *   GET  /api/rutas/health   — Health check
 */
@RestController
@RequestMapping("/api/rutas")
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class RutasController {

    private final RuteoAlgoritmoService ruteoService;

    public RutasController(RuteoAlgoritmoService ruteoService) {
        this.ruteoService = ruteoService;
    }

    /**
     * POST /api/rutas/simular
     *
     * Recibe los 3 archivos de datos y ejecuta el escenario seleccionado.
     *
     * @param aeropuertos  archivo de aeropuertos (UTF-16)
     * @param vuelos       archivo de planes de vuelo
     * @param envios       archivo de envíos
     * @param escenario    1=Tiempo real, 2=Periodo (SA vs ALNS), 3=Colapso
     */
    @PostMapping("/simular")
    public ResponseEntity<?> simular(
            @RequestParam("aeropuertos") MultipartFile aeropuertos,
            @RequestParam("vuelos") MultipartFile vuelos,
            @RequestParam("envios") List<MultipartFile> envios,
            @RequestParam(value = "escenario", defaultValue = "1") int escenario) {

        try {
            if (aeropuertos.isEmpty() || vuelos.isEmpty() || envios == null || envios.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Los archivos de vuelos, aeropuertos y al menos un archivo de envíos son requeridos."));
            }

            if (escenario < 1 || escenario > 3) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Escenario debe ser 1, 2 o 3."));
            }

            RutaResponseDTO resultado = ruteoService.ejecutarRuteo(
                    aeropuertos.getInputStream(),
                    vuelos.getInputStream(),
                    envios,
                    escenario
            );

            return ResponseEntity.ok(resultado);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Error interno: " + e.getMessage()));
        }
    }

    /**
     * GET /api/rutas/health
     */
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("LoadRoute Logistics — Sistema de Ruteo Activo");
    }
}
