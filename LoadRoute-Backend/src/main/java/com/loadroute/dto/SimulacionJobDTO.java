package com.loadroute.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class SimulacionJobDTO {

    @JsonProperty("jobId")
    private String jobId;

    @JsonProperty("status")
    private String status;

    @JsonProperty("progress")
    private int progress;

    @JsonProperty("message")
    private String message;

    @JsonProperty("chunks")
    private List<RutaResponseDTO> chunks = new ArrayList<>();

    @JsonProperty("chunkCount")
    private Integer chunkCount;

    @JsonProperty("chunkStart")
    private Integer chunkStart;

    @JsonProperty("error")
    private String error;

    @JsonProperty("owner")
    private String owner;

    public SimulacionJobDTO() {}

    public SimulacionJobDTO(String jobId, String status, int progress, String message) {
        this.jobId = jobId;
        this.status = status;
        this.progress = progress;
        this.message = message;
    }

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getOwner() { return owner; }
    public void setOwner(String owner) { this.owner = owner; }

    public synchronized List<RutaResponseDTO> getChunks() { return chunks; }
    public synchronized void setChunks(List<RutaResponseDTO> chunks) { this.chunks = chunks; }
    public synchronized void addChunk(RutaResponseDTO chunk) { this.chunks.add(chunk); }

    public Integer getChunkCount() { return chunkCount; }
    public void setChunkCount(Integer chunkCount) { this.chunkCount = chunkCount; }

    public Integer getChunkStart() { return chunkStart; }
    public void setChunkStart(Integer chunkStart) { this.chunkStart = chunkStart; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public synchronized SimulacionJobDTO copyStatus() {
        SimulacionJobDTO dto = new SimulacionJobDTO(jobId, status, progress, message);
        dto.setError(error);
        dto.setChunks(null);
        dto.setChunkCount(chunks != null ? chunks.size() : 0);
        dto.setChunkStart(null);
        dto.setOwner(owner);
        return dto;
    }

    public synchronized SimulacionJobDTO copyChunks(int desde) {
        int total = chunks != null ? chunks.size() : 0;
        int inicio = Math.max(0, Math.min(desde, total));
        SimulacionJobDTO dto = new SimulacionJobDTO(jobId, status, progress, message);
        dto.setError(error);
        dto.setChunkCount(total);
        dto.setChunkStart(inicio);
        dto.setOwner(owner);
        dto.setChunks(new ArrayList<>(chunks.subList(inicio, total)));
        return dto;
    }
}
