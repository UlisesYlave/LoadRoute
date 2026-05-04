package com.loadroute.service;

import com.loadroute.dto.RutaResponseDTO;
import com.loadroute.dto.SimulacionJobDTO;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class RuteoAsyncJobService {

    private final RuteoAlgoritmoService ruteoService;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final Map<String, SimulacionJobDTO> jobs = new ConcurrentHashMap<>();

    public RuteoAsyncJobService(RuteoAlgoritmoService ruteoService) {
        this.ruteoService = ruteoService;
    }

    public SimulacionJobDTO iniciar(MultipartFile aeropuertosFile,
                                    MultipartFile vuelosFile,
                                    List<MultipartFile> enviosFiles,
                                    int escenario,
                                    String fechaInicio,
                                    String fechaFin,
                                    String algoritmos) throws IOException {
        String jobId = UUID.randomUUID().toString();
        SimulacionJobDTO job = new SimulacionJobDTO(jobId, "PENDING", 0, "Preparando archivos...");
        jobs.put(jobId, job);

        byte[] aeropuertosBytes = aeropuertosFile.getBytes();
        byte[] vuelosBytes = vuelosFile.getBytes();
        List<MultipartFile> enviosBytes = new ArrayList<>();
        for (MultipartFile file : enviosFiles) {
            enviosBytes.add(new ByteMultipartFile(
                    file.getName(),
                    file.getOriginalFilename(),
                    file.getContentType(),
                    file.getBytes()
            ));
        }

        executor.submit(() -> {
            update(jobId, "RUNNING", 5, "Archivos recibidos. Iniciando simulacion...");
            try {
                List<RutaResponseDTO> chunks = ruteoService.ejecutarRuteo(
                        new ByteArrayInputStream(aeropuertosBytes),
                        new ByteArrayInputStream(vuelosBytes),
                        enviosBytes,
                        escenario,
                        fechaInicio,
                        fechaFin,
                        algoritmos,
                        new RuteoAlgoritmoService.ProgressReporter() {
                            @Override
                            public void update(int progress, String message) {
                                RuteoAsyncJobService.this.update(jobId, "RUNNING", progress, message);
                            }
                            @Override
                            public void onChunk(RutaResponseDTO chunk) {
                                SimulacionJobDTO current = jobs.get(jobId);
                                if (current != null) {
                                    current.addChunk(chunk);
                                }
                            }
                        }
                );
                SimulacionJobDTO current = jobs.get(jobId);
                current.setStatus("DONE");
                current.setProgress(100);
                current.setMessage("Simulacion completada.");
            } catch (Exception e) {
                SimulacionJobDTO current = jobs.get(jobId);
                current.setStatus("ERROR");
                current.setProgress(100);
                current.setMessage("La simulacion fallo.");
                current.setError(e.getMessage());
            }
        });

        return job.copy();
    }

    public SimulacionJobDTO obtener(String jobId) {
        SimulacionJobDTO job = jobs.get(jobId);
        return job != null ? job.copy() : null;
    }

    private void update(String jobId, String status, int progress, String message) {
        SimulacionJobDTO job = jobs.get(jobId);
        if (job == null) return;
        job.setStatus(status);
        job.setProgress(Math.max(0, Math.min(100, progress)));
        job.setMessage(message);
    }

    private static class ByteMultipartFile implements MultipartFile {
        private final String name;
        private final String originalFilename;
        private final String contentType;
        private final byte[] bytes;

        private ByteMultipartFile(String name, String originalFilename, String contentType, byte[] bytes) {
            this.name = name;
            this.originalFilename = originalFilename;
            this.contentType = contentType;
            this.bytes = bytes;
        }

        @Override public String getName() { return name; }
        @Override public String getOriginalFilename() { return originalFilename; }
        @Override public String getContentType() { return contentType; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(java.io.File dest) throws IOException {
            java.nio.file.Files.write(dest.toPath(), bytes);
        }
    }
}
