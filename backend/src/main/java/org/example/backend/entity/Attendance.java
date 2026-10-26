package org.example.backend.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "attendances")
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "attendance_date", nullable = false)
    private LocalDate date;

    @Enumerated(EnumType.STRING)
    @Column(name = "shift_type", length = 20)
    private ShiftType shiftType;

    @Column(name = "shift_start_time")
    private String shiftStartTime;

    @Column(name = "shift_end_time")
    private String shiftEndTime;

    @Column(name = "check_in_time")
    private LocalDateTime checkInTime;

    @Column(name = "check_out_time")
    private LocalDateTime checkOutTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "production_stage", length = 50)
    private ProductionStage stage;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "production_order_id")
    private ProductionOrder productionOrder;

    @Column(name = "break_minutes")
    private Integer breakMinutes = 30;

    @Column(name = "actual_work_hours")
    private Double actualWorkHours;

    @Column(name = "regular_hours")
    private Double regularHours = 0.0;

    @Column(name = "overtime_hours")
    private Double overtimeHours = 0.0;

    @Enumerated(EnumType.STRING)
    @Column(name = "attendance_status", length = 20)
    private AttendanceStatus attendanceStatus = AttendanceStatus.ON_TIME;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "check_in_address", length = 500)
    private String checkInAddress;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "distance_meters")
    private Integer distanceMeters;

    @Column(name = "location_verified")
    private Boolean locationVerified;

    @Column(name = "check_in_photo_url", columnDefinition = "TEXT")
    private String checkInPhotoUrl;

    @Column(name = "standard_hours")
    private Double standardHours;

    @Column(name = "hourly_rate_vnd")
    private Double hourlyRateVnd;

    @Column(name = "overtime_multiplier")
    private Double overtimeMultiplier;

    @Column(name = "location_accuracy_meters")
    private Double locationAccuracyMeters;

    @Column(name = "location_status")
    private String locationStatus;

    @Column(name = "location_unavailable_reason", length = 500)
    private String locationUnavailableReason;

    @Column(name = "check_out_address", length = 500)
    private String checkOutAddress;

    @Column(name = "check_out_latitude")
    private Double checkOutLatitude;

    @Column(name = "check_out_longitude")
    private Double checkOutLongitude;

    @Column(name = "check_out_location_accuracy_meters")
    private Double checkOutLocationAccuracyMeters;

    @Column(name = "check_out_distance_meters")
    private Integer checkOutDistanceMeters;

    @Column(name = "check_out_location_verified")
    private Boolean checkOutLocationVerified;

    @Column(name = "check_out_location_status")
    private String checkOutLocationStatus;

    @Column(name = "check_out_location_unavailable_reason", length = 500)
    private String checkOutLocationUnavailableReason;

    @Column(name = "check_out_photo_url", columnDefinition = "TEXT")
    private String checkOutPhotoUrl;

    public enum ShiftType {
        SANG,    // Ca sang: 6:00 - 14:00
        CHIEU,   // Ca chieu: 14:00 - 22:00
        DEM,     // Ca dem: 22:00 - 6:00
        NGAY     // Lam ca ngay: 6:00 - 18:00
    }

    public enum ProductionStage {
        RANH_VA_CHON,  // Rang va chon
        RANG,           // Rang
        XAY,            // Xay
        DONG_GOI,       // Dong goi
        QA              // Kiem tra chat luong
    }

    public enum AttendanceStatus {
        ON_TIME,
        LATE,
        MISSING_CHECKOUT,
        ABSENT
    }

    public Attendance() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Team getTeam() { return team; }
    public void setTeam(Team team) { this.team = team; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public ShiftType getShiftType() { return shiftType; }
    public void setShiftType(ShiftType shiftType) { this.shiftType = shiftType; }
    public String getShiftStartTime() { return shiftStartTime; }
    public void setShiftStartTime(String shiftStartTime) { this.shiftStartTime = shiftStartTime; }
    public String getShiftEndTime() { return shiftEndTime; }
    public void setShiftEndTime(String shiftEndTime) { this.shiftEndTime = shiftEndTime; }
    public LocalDateTime getCheckInTime() { return checkInTime; }
    public void setCheckInTime(LocalDateTime checkInTime) { this.checkInTime = checkInTime; }
    public LocalDateTime getCheckOutTime() { return checkOutTime; }
    public void setCheckOutTime(LocalDateTime checkOutTime) { this.checkOutTime = checkOutTime; }
    public ProductionStage getStage() { return stage; }
    public void setStage(ProductionStage stage) { this.stage = stage; }
    public ProductionOrder getProductionOrder() { return productionOrder; }
    public void setProductionOrder(ProductionOrder productionOrder) { this.productionOrder = productionOrder; }
    public Integer getBreakMinutes() { return breakMinutes; }
    public void setBreakMinutes(Integer breakMinutes) { this.breakMinutes = breakMinutes; }
    public Double getActualWorkHours() { return actualWorkHours; }
    public void setActualWorkHours(Double actualWorkHours) { this.actualWorkHours = actualWorkHours; }
    public Double getRegularHours() { return regularHours; }
    public void setRegularHours(Double regularHours) { this.regularHours = regularHours; }
    public Double getOvertimeHours() { return overtimeHours; }
    public void setOvertimeHours(Double overtimeHours) { this.overtimeHours = overtimeHours; }
    public AttendanceStatus getAttendanceStatus() { return attendanceStatus; }
    public void setAttendanceStatus(AttendanceStatus attendanceStatus) { this.attendanceStatus = attendanceStatus; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getCheckInAddress() { return checkInAddress; }
    public void setCheckInAddress(String checkInAddress) { this.checkInAddress = checkInAddress; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Integer getDistanceMeters() { return distanceMeters; }
    public void setDistanceMeters(Integer distanceMeters) { this.distanceMeters = distanceMeters; }
    public Boolean getLocationVerified() { return locationVerified; }
    public void setLocationVerified(Boolean locationVerified) { this.locationVerified = locationVerified; }
    public String getCheckInPhotoUrl() { return checkInPhotoUrl; }
    public void setCheckInPhotoUrl(String checkInPhotoUrl) { this.checkInPhotoUrl = checkInPhotoUrl; }
    public Double getStandardHours() { return standardHours; }
    public void setStandardHours(Double standardHours) { this.standardHours = standardHours; }
    public Double getHourlyRateVnd() { return hourlyRateVnd; }
    public void setHourlyRateVnd(Double hourlyRateVnd) { this.hourlyRateVnd = hourlyRateVnd; }
    public Double getOvertimeMultiplier() { return overtimeMultiplier; }
    public void setOvertimeMultiplier(Double overtimeMultiplier) { this.overtimeMultiplier = overtimeMultiplier; }
    public Double getLocationAccuracyMeters() { return locationAccuracyMeters; }
    public void setLocationAccuracyMeters(Double locationAccuracyMeters) { this.locationAccuracyMeters = locationAccuracyMeters; }
    public String getLocationStatus() { return locationStatus; }
    public void setLocationStatus(String locationStatus) { this.locationStatus = locationStatus; }
    public String getLocationUnavailableReason() { return locationUnavailableReason; }
    public void setLocationUnavailableReason(String locationUnavailableReason) { this.locationUnavailableReason = locationUnavailableReason; }
    public String getCheckOutAddress() { return checkOutAddress; }
    public void setCheckOutAddress(String checkOutAddress) { this.checkOutAddress = checkOutAddress; }
    public Double getCheckOutLatitude() { return checkOutLatitude; }
    public void setCheckOutLatitude(Double checkOutLatitude) { this.checkOutLatitude = checkOutLatitude; }
    public Double getCheckOutLongitude() { return checkOutLongitude; }
    public void setCheckOutLongitude(Double checkOutLongitude) { this.checkOutLongitude = checkOutLongitude; }
    public Double getCheckOutLocationAccuracyMeters() { return checkOutLocationAccuracyMeters; }
    public void setCheckOutLocationAccuracyMeters(Double checkOutLocationAccuracyMeters) { this.checkOutLocationAccuracyMeters = checkOutLocationAccuracyMeters; }
    public Integer getCheckOutDistanceMeters() { return checkOutDistanceMeters; }
    public void setCheckOutDistanceMeters(Integer checkOutDistanceMeters) { this.checkOutDistanceMeters = checkOutDistanceMeters; }
    public Boolean getCheckOutLocationVerified() { return checkOutLocationVerified; }
    public void setCheckOutLocationVerified(Boolean checkOutLocationVerified) { this.checkOutLocationVerified = checkOutLocationVerified; }
    public String getCheckOutLocationStatus() { return checkOutLocationStatus; }
    public void setCheckOutLocationStatus(String checkOutLocationStatus) { this.checkOutLocationStatus = checkOutLocationStatus; }
    public String getCheckOutLocationUnavailableReason() { return checkOutLocationUnavailableReason; }
    public void setCheckOutLocationUnavailableReason(String checkOutLocationUnavailableReason) { this.checkOutLocationUnavailableReason = checkOutLocationUnavailableReason; }
    public String getCheckOutPhotoUrl() { return checkOutPhotoUrl; }
    public void setCheckOutPhotoUrl(String checkOutPhotoUrl) { this.checkOutPhotoUrl = checkOutPhotoUrl; }
}
