package com.loadroute.controller;

import com.loadroute.dto.VueloDTO;
import com.loadroute.service.MaestroService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import com.loadroute.entity.VueloEntity;
import com.loadroute.entity.VueloCanceladoEntity;
import com.loadroute.dto.VueloCanceladoDTO;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

@RestController
@RequestMapping("/api/vuelos")
@CrossOrigin(origins = "*")
public class VueloController {

    private final MaestroService maestroService;
    private final com.loadroute.repository.VueloRepository vueloRepository;
    private final com.loadroute.repository.VueloCanceladoRepository vueloCanceladoRepository;
    private final com.loadroute.repository.VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository;
    private final com.loadroute.service.RuteoAsyncJobService asyncJobService;

    public VueloController(MaestroService maestroService,
                           com.loadroute.repository.VueloRepository vueloRepository,
                           com.loadroute.repository.VueloCanceladoRepository vueloCanceladoRepository,
                           com.loadroute.repository.VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository,
                           com.loadroute.service.RuteoAsyncJobService asyncJobService) {
        this.maestroService = maestroService;
        this.vueloRepository = vueloRepository;
        this.vueloCanceladoRepository = vueloCanceladoRepository;
        this.vueloCanceladoPeriodoRepository = vueloCanceladoPeriodoRepository;
        this.asyncJobService = asyncJobService;
    }

    @GetMapping("/config-cancelacion")
    public ResponseEntity<java.util.Map<String, Object>> getConfigCancelacion() {
        java.util.Map<String, Object> config = new java.util.HashMap<>();
        com.loadroute.service.RuteoAlgoritmoService.SimulacionIterator iterator = asyncJobService.getActiveIterator();
        
        if (iterator != null && iterator.getEscenario() == 1) {
            config.put("escenario", 1);
            config.put("limiteMinutos", iterator.getK() * iterator.getSa());
        } else {
            config.put("escenario", 2);
            config.put("limiteMinutos", 60);
        }
        return ResponseEntity.ok(config);
    }

    @GetMapping
    public ResponseEntity<List<VueloDTO>> listar() {
        return ResponseEntity.ok(maestroService.listarVuelos());
    }

    @GetMapping("/{id}")
    public ResponseEntity<VueloDTO> obtenerPorId(@PathVariable Long id) {
        return maestroService.obtenerVueloPorId(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<VueloDTO> crear(@RequestBody VueloDTO dto) {
        try {
            return ResponseEntity.ok(maestroService.crearVuelo(dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<VueloDTO> actualizar(@PathVariable Long id, @RequestBody VueloDTO dto) {
        try {
            return ResponseEntity.ok(maestroService.actualizarVuelo(id, dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable Long id) {
        try {
            maestroService.eliminarVuelo(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/cancelar")
    public ResponseEntity<String> cancelarVuelo(
            @PathVariable Long id,
            @RequestParam String fecha,
            @RequestParam(required = false, defaultValue = "2") int escenario,
            @RequestHeader(value = "X-Session-ID", required = false) String sessionId) {
        
        if (escenario == 3) {
            return ResponseEntity.badRequest().body("No se permiten cancelaciones en el escenario de colapso.");
        }
        
        String owner = (escenario == 1) ? asyncJobService.getActivePeriodoOwner() : asyncJobService.getActiveDiaADiaOwner();
        if (owner != null && !owner.equals(sessionId)) {
            return ResponseEntity.status(403).body("Solo el usuario que inició la simulación puede cancelar vuelos.");
        }
        
        Optional<VueloEntity> optVuelo = vueloRepository.findById(id);
        if (optVuelo.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        VueloEntity vuelo = optVuelo.get();
        
        LocalDate cancellationDate;
        try {
            cancellationDate = LocalDate.parse(fecha);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Formato de fecha inválido. Debe ser YYYY-MM-DD.");
        }
        
        LocalDateTime currentTime = asyncJobService.getActiveJobCurrentTime();
        if (currentTime == null) {
            currentTime = LocalDateTime.now(java.time.ZoneOffset.UTC);
        }
        
        LocalDateTime departureLocal = LocalDateTime.of(cancellationDate, vuelo.getHoraSalidaLocal());
        LocalDateTime departureGMT = departureLocal.minusHours(vuelo.getOrigen().getGmt());
        
        long minutesToDeparture = java.time.Duration.between(currentTime, departureGMT).toMinutes();
        long minMinutes = 60;
        if (escenario == 1) {
            com.loadroute.service.RuteoAlgoritmoService.SimulacionIterator iterator = asyncJobService.getActiveIterator();
            if (iterator != null && iterator.getEscenario() == 1) {
                minMinutes = iterator.getK() * iterator.getSa();
            } else {
                minMinutes = 80;
            }
        }
        
        if (minutesToDeparture <= minMinutes) {
            return ResponseEntity.badRequest().body("No se puede cancelar el vuelo. Falta menos de la ventana mínima (" + minMinutes + " min) para su salida.");
        }
        
        if (escenario == 1) {
            if (!vueloCanceladoPeriodoRepository.existsByVueloIdAndFecha(id, cancellationDate)) {
                vueloCanceladoPeriodoRepository.save(new com.loadroute.entity.VueloCanceladoPeriodoEntity(vuelo, cancellationDate));
            }
        } else {
            if (!vueloCanceladoRepository.existsByVueloIdAndFecha(id, cancellationDate)) {
                vueloCanceladoRepository.save(new VueloCanceladoEntity(vuelo, cancellationDate));
            }
        }
        
        return ResponseEntity.ok("Vuelo cancelado exitosamente.");
    }

    @PostMapping("/{id}/reactivar")
    public ResponseEntity<String> reactivarVuelo(
            @PathVariable Long id,
            @RequestParam String fecha,
            @RequestParam(required = false, defaultValue = "2") int escenario,
            @RequestHeader(value = "X-Session-ID", required = false) String sessionId) {
            
        if (escenario == 3) {
            return ResponseEntity.badRequest().body("No se permiten reactivaciones en el escenario de colapso.");
        }
        
        String owner = (escenario == 1) ? asyncJobService.getActivePeriodoOwner() : asyncJobService.getActiveDiaADiaOwner();
        if (owner != null && !owner.equals(sessionId)) {
            return ResponseEntity.status(403).body("Solo el usuario que inició la simulación puede reactivar vuelos.");
        }
            
        LocalDate cancellationDate;
        try {
            cancellationDate = LocalDate.parse(fecha);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Formato de fecha inválido. Debe ser YYYY-MM-DD.");
        }
        
        if (escenario == 1) {
            Optional<com.loadroute.entity.VueloCanceladoPeriodoEntity> optCancel = vueloCanceladoPeriodoRepository.findByVueloIdAndFecha(id, cancellationDate);
            if (optCancel.isPresent()) {
                vueloCanceladoPeriodoRepository.delete(optCancel.get());
                return ResponseEntity.ok("Vuelo reactivado exitosamente.");
            }
        } else {
            Optional<VueloCanceladoEntity> optCancel = vueloCanceladoRepository.findByVueloIdAndFecha(id, cancellationDate);
            if (optCancel.isPresent()) {
                vueloCanceladoRepository.delete(optCancel.get());
                return ResponseEntity.ok("Vuelo reactivado exitosamente.");
            }
        }
        
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/cancelados")
    public ResponseEntity<List<VueloCanceladoDTO>> listarCancelados(
            @RequestParam(required = false, defaultValue = "2") int escenario) {
        List<VueloCanceladoDTO> dtos;
        
        if (escenario == 3) {
            dtos = java.util.Collections.emptyList();
        } else if (escenario == 1) {
            List<com.loadroute.entity.VueloCanceladoPeriodoEntity> list = vueloCanceladoPeriodoRepository.findAll();
            dtos = list.stream().map(c -> {
                VueloCanceladoDTO dto = new VueloCanceladoDTO();
                dto.setId(c.getId());
                dto.setVueloId(c.getVuelo().getId());
                dto.setFecha(c.getFecha().toString());
                return dto;
            }).collect(java.util.stream.Collectors.toList());
        } else {
            List<VueloCanceladoEntity> list = vueloCanceladoRepository.findAll();
            dtos = list.stream().map(c -> {
                VueloCanceladoDTO dto = new VueloCanceladoDTO();
                dto.setId(c.getId());
                dto.setVueloId(c.getVuelo().getId());
                dto.setFecha(c.getFecha().toString());
                return dto;
            }).collect(java.util.stream.Collectors.toList());
        }
        
        return ResponseEntity.ok(dtos);
    }
}
