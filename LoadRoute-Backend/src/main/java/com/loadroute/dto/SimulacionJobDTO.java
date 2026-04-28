package com.loadroute.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class SimulacionJobDTO {

    @JsonProperty("jobId")
    private String jobId;

    @JsonProperty("status")
    private String status;

    @JsonProperty("progress")
    private int progress;

    @JsonProperty("message")
    private String message;

    @JsonProperty("result")
    private RutaResponseDTO result;

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

    public RutaResponseDTO getResult() { return result; }
    public void setResult(RutaResponseDTO result) { this.result = result; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public SimulacionJobDTO copy() {
        SimulacionJobDTO dto = new SimulacionJobDTO(jobId, status, progress, message);
        dto.setResult(result);
        dto.setError(error);
        return dto;
    }
}
