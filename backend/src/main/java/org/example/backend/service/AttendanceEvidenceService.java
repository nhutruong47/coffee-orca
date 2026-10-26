package org.example.backend.service;

import org.example.backend.dto.AttendanceEvidenceRequest;
import org.example.backend.entity.Attendance;
import org.example.backend.entity.AttendanceSettings;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

/** Validates device-reported evidence; does not assert identity or spoof resistance. */
@Service
public class AttendanceEvidenceService {
    public record Photo(byte[] bytes, String contentType) {}
    public record Evidence(Double lat, Double lng, Double accuracy, String address, Integer distance,
                           Boolean verified, String status, String unavailableReason, String photo) {}

    public Evidence validate(AttendanceEvidenceRequest input, AttendanceSettings settings) {
        AttendanceEvidenceRequest req = input != null ? input : new AttendanceEvidenceRequest();
        Double lat = req.getLatitude();
        Double lng = req.getLongitude();
        Double accuracy = req.getAccuracyMeters();
        if ((lat == null) != (lng == null)) throw invalid("Cần cung cấp cả vĩ độ và kinh độ.");
        if (lat != null && (!Double.isFinite(lat) || Math.abs(lat) > 90
                || !Double.isFinite(lng) || Math.abs(lng) > 180)) throw invalid("Tọa độ GPS không hợp lệ.");
        if (accuracy != null && (!Double.isFinite(accuracy) || accuracy <= 0 || accuracy > 100_000))
            throw invalid("Độ chính xác GPS không hợp lệ.");
        String address = clean(req.getAddress());
        String reason = clean(req.getLocationUnavailableReason());
        if ((address != null && address.length() > 500) || (reason != null && reason.length() > 500))
            throw invalid("Địa chỉ/lý do dài tối đa 500 ký tự.");
        Integer distance = null;
        Boolean verified = null;
        String status = "UNVERIFIED";
        if (lat != null) {
            if (settings.getWorkshopLat() == null || settings.getWorkshopLng() == null) {
                status = "NOT_CONFIGURED";
            } else {
                double meters = distanceMeters(settings.getWorkshopLat(), settings.getWorkshopLng(), lat, lng);
                distance = (int) Math.round(meters);
                if (accuracy == null || accuracy > settings.getAllowedRadiusMeters()) {
                    status = "LOW_ACCURACY";
                } else if (meters + accuracy <= settings.getAllowedRadiusMeters()) {
                    status = "WITHIN_RADIUS";
                    verified = true;
                } else if (meters - accuracy > settings.getAllowedRadiusMeters()) {
                    status = "OUTSIDE_RADIUS";
                    verified = false;
                } else {
                    status = "LOW_ACCURACY";
                }
            }
        }
        if (Boolean.TRUE.equals(settings.getRequireLocation()) && !Boolean.TRUE.equals(verified))
            throw invalid("Cần GPS đủ chính xác trong bán kính xưởng. Hãy lấy lại vị trí hoặc báo quản lý.");
        String photo = canonicalPhoto(req.getPhotoDataUrl());
        if (Boolean.TRUE.equals(settings.getRequirePhoto()) && photo == null)
            throw invalid("Xưởng yêu cầu ảnh chấm công. Vui lòng chụp hoặc chọn ảnh.");
        return new Evidence(lat, lng, accuracy, address, distance, verified, status, reason, photo);
    }

    public void apply(Attendance row, Evidence evidence, boolean checkout) {
        if (checkout) {
            row.setCheckOutLatitude(evidence.lat());
            row.setCheckOutLongitude(evidence.lng());
            row.setCheckOutLocationAccuracyMeters(evidence.accuracy());
            row.setCheckOutAddress(evidence.address());
            row.setCheckOutDistanceMeters(evidence.distance());
            row.setCheckOutLocationVerified(evidence.verified());
            row.setCheckOutLocationStatus(evidence.status());
            row.setCheckOutLocationUnavailableReason(evidence.unavailableReason());
            row.setCheckOutPhotoUrl(evidence.photo());
        } else {
            row.setLatitude(evidence.lat());
            row.setLongitude(evidence.lng());
            row.setLocationAccuracyMeters(evidence.accuracy());
            row.setCheckInAddress(evidence.address());
            row.setDistanceMeters(evidence.distance());
            row.setLocationVerified(evidence.verified());
            row.setLocationStatus(evidence.status());
            row.setLocationUnavailableReason(evidence.unavailableReason());
            row.setCheckInPhotoUrl(evidence.photo());
        }
    }

    public Photo photo(String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:image/"))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Không có ảnh chấm công.");
        int comma = dataUrl.indexOf(',');
        String type = dataUrl.substring(5, dataUrl.indexOf(';'));
        return new Photo(Base64.getDecoder().decode(dataUrl.substring(comma + 1)), type);
    }

    private String canonicalPhoto(String dataUrl) {
        if (dataUrl == null || dataUrl.isBlank()) return null;
        if (dataUrl.length() > 700_000 || !(dataUrl.startsWith("data:image/jpeg;base64,")
                || dataUrl.startsWith("data:image/png;base64,"))) throw invalid("Chỉ nhận ảnh JPEG/PNG tối đa 500 KB.");
        try {
            byte[] bytes = Base64.getDecoder().decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
            if (bytes.length > 500_000 || bytes.length == 0) throw invalid("Ảnh tối đa 500 KB.");
            try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) throw invalid("Không đọc được ảnh.");
                ImageReader reader = readers.next();
                try {
                    reader.setInput(stream);
                    if (reader.getWidth(0) > 1920 || reader.getHeight(0) > 1920)
                        throw invalid("Ảnh tối đa 1920×1920 pixel.");
                    var image = reader.read(0);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    String format = dataUrl.startsWith("data:image/png") ? "png" : "jpeg";
                    ImageIO.write(image, format, out); // Re-encode without EXIF or uploaded metadata.
                    if (out.size() > 500_000) throw invalid("Ảnh sau xử lý vượt 500 KB.");
                    return "data:image/" + format + ";base64," + Base64.getEncoder().encodeToString(out.toByteArray());
                } finally { reader.dispose(); }
            }
        } catch (java.io.IOException | IllegalArgumentException ex) {
            throw invalid("Ảnh chấm công không hợp lệ.");
        }
    }

    private static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double a = Math.pow(Math.sin(Math.toRadians(lat2 - lat1) / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.pow(Math.sin(Math.toRadians(lng2 - lng1) / 2), 2);
        return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    }

    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static RuntimeException invalid(String message) { return new IllegalArgumentException(message); }
}
