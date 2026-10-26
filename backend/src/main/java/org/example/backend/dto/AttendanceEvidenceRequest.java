package org.example.backend.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import org.example.backend.entity.Attendance;
import java.util.UUID;

@Getter
@Setter
public class AttendanceEvidenceRequest {
    private Attendance.ShiftType shiftType = Attendance.ShiftType.NGAY;
    private Attendance.ProductionStage stage;
    private UUID orderId;
    @DecimalMin("-90") @DecimalMax("90")
    private Double latitude;
    @DecimalMin("-180") @DecimalMax("180")
    private Double longitude;
    @DecimalMin("0.01") @DecimalMax("100000")
    private Double accuracyMeters;
    @Size(max = 500)
    private String address;
    @Size(max = 700000)
    private String photoDataUrl;
    @Size(max = 500)
    private String locationUnavailableReason;
}
