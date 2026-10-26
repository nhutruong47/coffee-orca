package org.example.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class AttendanceDTO {
    private String id;
    private String userId;
    private String userName;
    private String teamId;
    private LocalDate date;
    private String shiftType;
    private String shiftStartTime;
    private String shiftEndTime;
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
    private String productionStage;
    private String orderId;
    private String orderTitle;
    private Integer breakMinutes;
    private Double actualWorkHours;
    private Double regularHours;
    private Double overtimeHours;
    private String attendanceStatus;
    private String notes;
    private String checkInAddress;
    private Double latitude;
    private Double longitude;
    private Integer distanceMeters;
    private Boolean locationVerified;

    private Double standardHours;
    private Double hourlyRateVnd;
    private Double overtimeMultiplier;
    private Double locationAccuracyMeters;
    private String locationStatus;
    private String locationUnavailableReason;
    private String checkOutAddress;
    private Double checkOutLatitude;
    private Double checkOutLongitude;
    private Double checkOutLocationAccuracyMeters;
    private Integer checkOutDistanceMeters;
    private Boolean checkOutLocationVerified;
    private String checkOutLocationStatus;
    private String checkOutLocationUnavailableReason;
    private boolean hasCheckInPhoto;
    private boolean hasCheckOutPhoto;
    private Double regularPayVnd;
    private Double overtimePayVnd;
    private Double totalPayVnd;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public String getShiftType() { return shiftType; }
    public void setShiftType(String shiftType) { this.shiftType = shiftType; }
    public String getShiftStartTime() { return shiftStartTime; }
    public void setShiftStartTime(String shiftStartTime) { this.shiftStartTime = shiftStartTime; }
    public String getShiftEndTime() { return shiftEndTime; }
    public void setShiftEndTime(String shiftEndTime) { this.shiftEndTime = shiftEndTime; }
    public LocalDateTime getCheckInTime() { return checkInTime; }
    public void setCheckInTime(LocalDateTime checkInTime) { this.checkInTime = checkInTime; }
    public LocalDateTime getCheckOutTime() { return checkOutTime; }
    public void setCheckOutTime(LocalDateTime checkOutTime) { this.checkOutTime = checkOutTime; }
    public String getProductionStage() { return productionStage; }
    public void setProductionStage(String productionStage) { this.productionStage = productionStage; }
    public String getOrderId() { return orderId; }
    public void setOrderId(String orderId) { this.orderId = orderId; }
    public String getOrderTitle() { return orderTitle; }
    public void setOrderTitle(String orderTitle) { this.orderTitle = orderTitle; }
    public Integer getBreakMinutes() { return breakMinutes; }
    public void setBreakMinutes(Integer breakMinutes) { this.breakMinutes = breakMinutes; }
    public Double getActualWorkHours() { return actualWorkHours; }
    public void setActualWorkHours(Double actualWorkHours) { this.actualWorkHours = actualWorkHours; }
    public Double getRegularHours() { return regularHours; }
    public void setRegularHours(Double regularHours) { this.regularHours = regularHours; }
    public Double getOvertimeHours() { return overtimeHours; }
    public void setOvertimeHours(Double overtimeHours) { this.overtimeHours = overtimeHours; }
    public String getAttendanceStatus() { return attendanceStatus; }
    public void setAttendanceStatus(String attendanceStatus) { this.attendanceStatus = attendanceStatus; }
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
    public Double getWorkedHours() { return actualWorkHours; }
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
    public boolean isHasCheckInPhoto() { return hasCheckInPhoto; }
    public void setHasCheckInPhoto(boolean hasCheckInPhoto) { this.hasCheckInPhoto = hasCheckInPhoto; }
    public boolean isHasCheckOutPhoto() { return hasCheckOutPhoto; }
    public void setHasCheckOutPhoto(boolean hasCheckOutPhoto) { this.hasCheckOutPhoto = hasCheckOutPhoto; }
    public Double getRegularPayVnd() { return regularPayVnd; }
    public void setRegularPayVnd(Double regularPayVnd) { this.regularPayVnd = regularPayVnd; }
    public Double getOvertimePayVnd() { return overtimePayVnd; }
    public void setOvertimePayVnd(Double overtimePayVnd) { this.overtimePayVnd = overtimePayVnd; }
    public Double getTotalPayVnd() { return totalPayVnd; }
    public void setTotalPayVnd(Double totalPayVnd) { this.totalPayVnd = totalPayVnd; }
}
