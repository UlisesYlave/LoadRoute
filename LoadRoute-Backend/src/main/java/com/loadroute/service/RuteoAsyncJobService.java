package com.loadroute.service;

import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.dto.SimulacionJobDTO;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import java.time.LocalDateTime;

@Service
public class RuteoAsyncJobService {

    private static final long COMPLETED_JOB_TTL_MS = TimeUnit.MINUTES.toMillis(30);
    private static final long ERROR_JOB_TTL_MS = TimeUnit.MINUTES.toMillis(15);

    private final RuteoAlgoritmoService ruteoService;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService cleanupExecutor = Executors.newSingleThreadScheduledExecutor();
    private final ScheduledExecutorService simExecutor = Executors.newScheduledThreadPool(10);
    private final Map<String, java.util.concurrent.ScheduledFuture<?>> simTasks = new ConcurrentHashMap<>();
    private final Map<String, SimulacionJobDTO> jobs = new ConcurrentHashMap<>();
    private final Map<String, Long> finishedAt = new ConcurrentHashMap<>();
    private final Map<String, Long> lastPolledAt = new ConcurrentHashMap<>();
    private final Map<String, RuteoAlgoritmoService.SimulacionIterator> activeIterators = new ConcurrentHashMap<>();
    private final SimpMessagingTemplate messagingTemplate;
    private final com.loadroute.repository.VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository;

    public RuteoAsyncJobService(RuteoAlgoritmoService ruteoService, SimpMessagingTemplate messagingTemplate,
                                com.loadroute.repository.VueloCanceladoPeriodoRepository vueloCanceladoPeriodoRepository) {
        this.ruteoService = ruteoService;
        this.messagingTemplate = messagingTemplate;
        this.vueloCanceladoPeriodoRepository = vueloCanceladoPeriodoRepository;
        cleanupExecutor.scheduleAtFixedRate(this::cleanupExpiredJobs, 5, 5, TimeUnit.SECONDS);
    }

    private String activeDiaADiaJobId;
    private String activePeriodoJobId;
    private String activeColapsoJobId;
    private String activeDiaADiaOwner;
    private String activePeriodoOwner;
    private String activeColapsoOwner;

    public String getActiveDiaADiaOwner() { return activeDiaADiaOwner; }
    public String getActivePeriodoOwner() { return activePeriodoOwner; }
    public String getActiveColapsoOwner() { return activeColapsoOwner; }

    public LocalDateTime getActiveJobCurrentTime() {
        if (activeDiaADiaJobId == null) {
            return null;
        }
        RuteoAlgoritmoService.SimulacionIterator iterator = activeIterators.get(activeDiaADiaJobId);
        if (iterator != null) {
            return iterator.getCurrentTime();
        }
        return null;
    }

    public RuteoAlgoritmoService.SimulacionIterator getActiveIterator() {
        for (Map.Entry<String, SimulacionJobDTO> entry : jobs.entrySet()) {
            if ("RUNNING".equals(entry.getValue().getStatus()) || "PENDING".equals(entry.getValue().getStatus())) {
                return activeIterators.get(entry.getKey());
            }
        }
        return null;
    }

    public SimulacionJobDTO iniciar(int escenario,
                                    String fechaInicio,
                                    String fechaFin,
                                    Integer tiempoEsperaEscala,
                                    Integer tiempoEsperaDestino,
                                    Integer sa,
                                    Integer k,
                                    String sessionId) {
        cleanupExpiredJobs();

        if (escenario == 1) {
            if (activePeriodoJobId != null) {
                SimulacionJobDTO activeJob = jobs.get(activePeriodoJobId);
                if (activeJob != null && ("RUNNING".equals(activeJob.getStatus()) || "PENDING".equals(activeJob.getStatus()))) {
                    return activeJob.copyStatus();
                }
            }
            vueloCanceladoPeriodoRepository.deleteAllInBatch();
        }

        if (escenario == 2 && activeDiaADiaJobId != null) {
            SimulacionJobDTO activeJob = jobs.get(activeDiaADiaJobId);
            if (activeJob != null && ("RUNNING".equals(activeJob.getStatus()) || "PENDING".equals(activeJob.getStatus()))) {
                return activeJob.copyStatus();
            }
        }

        if (escenario == 3 && activeColapsoJobId != null) {
            SimulacionJobDTO activeJob = jobs.get(activeColapsoJobId);
            if (activeJob != null && ("RUNNING".equals(activeJob.getStatus()) || "PENDING".equals(activeJob.getStatus()))) {
                return activeJob.copyStatus();
            }
        }

        String jobId = UUID.randomUUID().toString();
        if (escenario == 2) {
            activeDiaADiaJobId = jobId;
            activeDiaADiaOwner = sessionId;
        } else if (escenario == 1) {
            activePeriodoJobId = jobId;
            activePeriodoOwner = sessionId;
        } else if (escenario == 3) {
            activeColapsoJobId = jobId;
            activeColapsoOwner = sessionId;
        }
        SimulacionJobDTO job = new SimulacionJobDTO(jobId, "PENDING", 0, "Iniciando simulacion...");
        job.setOwner(sessionId);
        job.setFechaInicio(fechaInicio);
        job.setFechaFin(fechaFin);
        jobs.put(jobId, job);
        lastPolledAt.put(jobId, System.currentTimeMillis());

        executor.submit(() -> {
            update(jobId, "RUNNING", 5, "Cargando datos e preparando simulacion periodica...");
            try {
                RuteoAlgoritmoService.SimulacionIterator iterator = ruteoService.prepararIteradorRuteo(
                        null, null, null, escenario, fechaInicio, fechaFin,
                        tiempoEsperaEscala, tiempoEsperaDestino, sa, k,
                        (progress, message) -> RuteoAsyncJobService.this.update(jobId, "RUNNING", progress, message)
                );

                activeIterators.put(jobId, iterator);
                int saPeriod = iterator.getSa();
                
                update(jobId, "RUNNING", 35, "Ejecutando primer salto (Sc)...");
                
                java.util.concurrent.ScheduledFuture<?> task = simExecutor.scheduleAtFixedRate(() -> {
                    try {
                        if (!iterator.hasNext()) {
                            SimulacionJobDTO current = jobs.get(jobId);
                            if (current != null) {
                                current.setStatus("DONE");
                                current.setProgress(100);
                                current.setMessage("Simulacion completada.");
                                finishedAt.put(jobId, System.currentTimeMillis());
                                messagingTemplate.convertAndSend("/topic/simulacion", "{\"event\": \"SIMULACION_FINALIZADA\", \"jobId\": \"" + jobId + "\"}");
                            }
                            cancelarTarea(jobId);
                            return;
                        }

                        RutaResponseDTO chunk = iterator.nextChunk();
                        if (chunk != null) {
                            SimulacionJobDTO current = jobs.get(jobId);
                            if (current != null) current.addChunk(chunk);
                        }

                        if (iterator.hasColapsado()) {
                            SimulacionJobDTO current = jobs.get(jobId);
                            if (current != null) {
                                current.setStatus("ERROR");
                                current.setProgress(100);
                                current.setMessage(iterator.getMensajeColapso());
                                current.setError(iterator.getMensajeColapso());
                                finishedAt.put(jobId, System.currentTimeMillis());
                                messagingTemplate.convertAndSend("/topic/simulacion", "{\"event\": \"SIMULACION_ERROR\", \"jobId\": \"" + jobId + "\"}");
                            }
                            cancelarTarea(jobId);
                        }

                    } catch (Exception ex) {
                        SimulacionJobDTO current = jobs.get(jobId);
                        if (current != null) {
                            current.setStatus("ERROR");
                            current.setProgress(100);
                            current.setMessage("Fallo iteracion.");
                            current.setError(ex.getMessage());
                            finishedAt.put(jobId, System.currentTimeMillis());
                        }
                        cancelarTarea(jobId);
                    }
                }, 0, saPeriod, TimeUnit.MINUTES);
                
                simTasks.put(jobId, task);

            } catch (Exception e) {
                SimulacionJobDTO current = jobs.get(jobId);
                if (current != null) {
                    current.setStatus("ERROR");
                    current.setProgress(100);
                    current.setMessage("La simulacion fallo al iniciar.");
                    current.setError(e.getMessage());
                    finishedAt.put(jobId, System.currentTimeMillis());
                    messagingTemplate.convertAndSend("/topic/simulacion", "{\"event\": \"SIMULACION_ERROR\", \"jobId\": \"" + jobId + "\"}");
                }
            }
        });

        return job.copyStatus();
    }

    public SimulacionJobDTO obtenerEstado(String jobId) {
        cleanupExpiredJobs();
        SimulacionJobDTO job = jobs.get(jobId);
        if (job != null) {
            lastPolledAt.put(jobId, System.currentTimeMillis());
        }
        return job != null ? job.copyStatus() : null;
    }

    public SimulacionJobDTO obtenerChunks(String jobId, int desde) {
        cleanupExpiredJobs();
        SimulacionJobDTO job = jobs.get(jobId);
        if (job != null) {
            lastPolledAt.put(jobId, System.currentTimeMillis());
        }
        return job != null ? job.copyChunks(desde) : null;
    }

    public boolean eliminar(String jobId, String sessionId) {
        SimulacionJobDTO job = jobs.get(jobId);
        if (job != null) {
            String owner = job.getOwner();
            if (owner != null && !owner.equals(sessionId)) {
                return false;
            }
        }
        if (jobId.equals(activeDiaADiaJobId)) {
            activeDiaADiaJobId = null;
            activeDiaADiaOwner = null;
        }
        if (jobId.equals(activePeriodoJobId)) {
            activePeriodoJobId = null;
            activePeriodoOwner = null;
        }
        if (jobId.equals(activeColapsoJobId)) {
            activeColapsoJobId = null;
            activeColapsoOwner = null;
        }
        finishedAt.remove(jobId);
        lastPolledAt.remove(jobId);
        cancelarTarea(jobId);
        return jobs.remove(jobId) != null;
    }

    private void cancelarTarea(String jobId) {
        activeIterators.remove(jobId);
        java.util.concurrent.ScheduledFuture<?> task = simTasks.remove(jobId);
        if (task != null) {
            task.cancel(true);
        }
    }

    private void update(String jobId, String status, int progress, String message) {
        SimulacionJobDTO job = jobs.get(jobId);
        if (job == null) return;
        job.setStatus(status);
        job.setProgress(Math.max(0, Math.min(100, progress)));
        job.setMessage(message);
    }

    private void cleanupExpiredJobs() {
        long now = System.currentTimeMillis();
        
        // 1. Limpieza de trabajos activos por inactividad (sin solicitudes en los últimos 20 segundos)
        for (String jobId : new java.util.HashSet<>(jobs.keySet())) {
            SimulacionJobDTO job = jobs.get(jobId);
            if (job == null) continue;
            
            String status = job.getStatus();
            if ("RUNNING".equals(status) || "PENDING".equals(status)) {
                Long lastPolled = lastPolledAt.get(jobId);
                if (lastPolled != null && (now - lastPolled > 20000)) {
                    jobs.remove(jobId);
                    if (jobId.equals(activeDiaADiaJobId)) {
                        activeDiaADiaJobId = null;
                        activeDiaADiaOwner = null;
                        System.out.println("La simulación Día a Día [" + jobId + "] se detuvo debido a inactividad (sin usuarios conectados).");
                    } else if (jobId.equals(activePeriodoJobId)) {
                        activePeriodoJobId = null;
                        activePeriodoOwner = null;
                        System.out.println("La simulación de Periodo [" + jobId + "] se detuvo debido a inactividad (sin usuarios conectados).");
                    } else if (jobId.equals(activeColapsoJobId)) {
                        activeColapsoJobId = null;
                        activeColapsoOwner = null;
                        System.out.println("La simulación de Colapso [" + jobId + "] se detuvo debido a inactividad (sin usuarios conectados).");
                    } else {
                        System.out.println("La simulación [" + jobId + "] se detuvo debido a inactividad (sin usuarios conectados).");
                    }
                    lastPolledAt.remove(jobId);
                    finishedAt.remove(jobId);
                    cancelarTarea(jobId);
                }
            }
        }
        
        // 2. Limpieza estándar por TTL para completados/errores
        for (Map.Entry<String, Long> entry : finishedAt.entrySet()) {
            SimulacionJobDTO job = jobs.get(entry.getKey());
            if (job == null) {
                finishedAt.remove(entry.getKey());
                continue;
            }

            long ttl = "ERROR".equals(job.getStatus()) ? ERROR_JOB_TTL_MS : COMPLETED_JOB_TTL_MS;
            if (now - entry.getValue() > ttl) {
                jobs.remove(entry.getKey());
                cancelarTarea(entry.getKey());
                finishedAt.remove(entry.getKey());
                lastPolledAt.remove(entry.getKey());
            }
        }
    }

    public Map<Integer, SimulacionJobDTO> obtenerTrabajosActivos() {
        Map<Integer, SimulacionJobDTO> active = new ConcurrentHashMap<>();
        if (activePeriodoJobId != null) {
            SimulacionJobDTO job = jobs.get(activePeriodoJobId);
            if (job != null && ("RUNNING".equals(job.getStatus()) || "PENDING".equals(job.getStatus()))) {
                active.put(1, job.copyStatus());
            }
        }
        if (activeDiaADiaJobId != null) {
            SimulacionJobDTO job = jobs.get(activeDiaADiaJobId);
            if (job != null && ("RUNNING".equals(job.getStatus()) || "PENDING".equals(job.getStatus()))) {
                active.put(2, job.copyStatus());
            }
        }
        if (activeColapsoJobId != null) {
            SimulacionJobDTO job = jobs.get(activeColapsoJobId);
            if (job != null && ("RUNNING".equals(job.getStatus()) || "PENDING".equals(job.getStatus()))) {
                active.put(3, job.copyStatus());
            }
        }
        return active;
    }

    @jakarta.annotation.PreDestroy
    public void shutdown() {
        executor.shutdownNow();
        cleanupExecutor.shutdownNow();
        simExecutor.shutdownNow();
    }

    private Path persistMultipart(Path dir, MultipartFile file, String fallbackName) throws IOException {
        String original = file.getOriginalFilename();
        String safeName = original != null && !original.isBlank()
                ? original.replaceAll("[^A-Za-z0-9._-]", "_")
                : fallbackName;
        Path target = dir.resolve(safeName);
        int suffix = 1;
        while (Files.exists(target)) {
            int dot = safeName.lastIndexOf('.');
            String base = dot >= 0 ? safeName.substring(0, dot) : safeName;
            String ext = dot >= 0 ? safeName.substring(dot) : "";
            target = dir.resolve(base + "-" + suffix + ext);
            suffix++;
        }
        file.transferTo(target.toFile());
        return target;
    }

    private void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) return;
        try {
            Files.walk(root)
                    .sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
        } catch (IOException ignored) {
        }
    }

    private static class TempMultipartFile implements MultipartFile {
        private final String name;
        private final String originalFilename;
        private final String contentType;
        private final Path path;

        private TempMultipartFile(String name, String originalFilename, String contentType, Path path) {
            this.name = name;
            this.originalFilename = originalFilename;
            this.contentType = contentType;
            this.path = path;
        }

        @Override public String getName() { return name; }
        @Override public String getOriginalFilename() { return originalFilename; }
        @Override public String getContentType() { return contentType; }
        @Override public boolean isEmpty() { return getSize() == 0; }
        @Override public long getSize() {
            try { return Files.size(path); }
            catch (IOException e) { return 0; }
        }
        @Override public byte[] getBytes() throws IOException { return Files.readAllBytes(path); }
        @Override public InputStream getInputStream() throws IOException { return Files.newInputStream(path); }
        @Override public void transferTo(java.io.File dest) throws IOException {
            Files.copy(path, dest.toPath());
        }
    }
}
