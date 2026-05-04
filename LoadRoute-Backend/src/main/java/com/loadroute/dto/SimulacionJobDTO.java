package com.loadroute.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;

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

    @JsonProperty("error")
    private String error;

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

    public List<RutaResponseDTO> getChunks() { return chunks; }
    public void setChunks(List<RutaResponseDTO> chunks) { this.chunks = chunks; }
    public void addChunk(RutaResponseDTO chunk) { this.chunks.add(chunk); }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public SimulacionJobDTO copy() {
        SimulacionJobDTO dto = new SimulacionJobDTO(jobId, status, progress, message);
        dto.setError(error);
        dto.setChunks(new ArrayList<>(chunks));
        return dto;
    }
}
