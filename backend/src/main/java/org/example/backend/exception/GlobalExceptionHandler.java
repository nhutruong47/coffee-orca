package org.example.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatusException(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        String message = ex.getReason() != null ? ex.getReason() : status.getReasonPhrase();
        return buildResponse(status, status.name(), message);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return buildResponse(HttpStatus.FORBIDDEN, "Forbidden", ex.getMessage());
    }

    @ExceptionHandler({AuthenticationException.class, AuthenticationCredentialsNotFoundException.class})
    public ResponseEntity<Map<String, Object>> handleAuthenticationException(AuthenticationException ex) {
        return buildResponse(HttpStatus.UNAUTHORIZED, "Unauthorized",
                ex.getMessage() != null ? ex.getMessage() : "Authentication required");
    }

    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<Map<String, Object>> handleNullPointer(NullPointerException ex) {
        log.error("NullPointerException caught by handler", ex);
        return buildResponse(HttpStatus.BAD_REQUEST, "Bad Request",
                "Thiếu dữ liệu bắt buộc hoặc tham chiếu không hợp lệ.");
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntimeException(RuntimeException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Lỗi nghiệp vụ", ex.getMessage());
    }

    @ExceptionHandler(PlanLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handlePlanLimitExceeded(PlanLimitExceededException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", HttpStatus.CONFLICT.value());
        body.put("error", "PLAN_LIMIT_EXCEEDED");
        body.put("message", ex.getMessage());
        body.put("limitType", ex.getLimitType());
        body.put("current", ex.getCurrent());
        body.put("limit", ex.getLimit());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrity(DataIntegrityViolationException ex) {
        String detail = ex.getMostSpecificCause().getMessage();
        String friendlyMsg;

        if (detail.contains("Duplicate") || detail.contains("UNIQUE") || detail.contains("unique")) {
            friendlyMsg = "Dữ liệu bị trùng! Kiểm tra lại các trường có giá trị duy nhất (SKU, username, mã...)";
        } else if (detail.contains("FOREIGN KEY") || detail.contains("foreign key")) {
            friendlyMsg = "Không thể thực hiện vì có dữ liệu liên kết. Xóa dữ liệu liên quan trước.";
        } else if (detail.contains("NULL") || detail.contains("cannot be null")) {
            friendlyMsg = "Thiếu trường bắt buộc! Vui lòng điền đầy đủ thông tin.";
        } else {
            friendlyMsg = "Lỗi dữ liệu: " + detail;
        }

        return buildResponse(HttpStatus.CONFLICT, "Lỗi dữ liệu", friendlyMsg);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(MissingServletRequestParameterException ex) {
        String msg = "Thiếu tham số bắt buộc: " + ex.getParameterName() + " (kiểu: " + ex.getParameterType() + ")";
        return buildResponse(HttpStatus.BAD_REQUEST, "Thiếu tham số", msg);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        String msg = "Tham số '" + ex.getName() + "' có giá trị không hợp lệ: '" + ex.getValue()
                + "'. Kiểu yêu cầu: "
                + (ex.getRequiredType() != null ? ex.getRequiredType().getSimpleName() : "không xác định");
        return buildResponse(HttpStatus.BAD_REQUEST, "Sai kiểu dữ liệu", msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleBadJson(HttpMessageNotReadableException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Lỗi định dạng",
                "Dữ liệu gửi lên không đúng định dạng JSON. Kiểm tra lại body request.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", 400);
        body.put("error", "Lỗi validation");

        Map<String, String> fieldErrors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(fe -> {
            log.warn("Validation error: field={}, message={}", fe.getField(), fe.getDefaultMessage());
            fieldErrors.put(fe.getField(), fe.getDefaultMessage());
        });
        body.put("fields", fieldErrors);
        body.put("message", "Có " + fieldErrors.size() + " trường không hợp lệ");

        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResourceFound(org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, "Not Found", ex.getMessage());
    }

    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethodNotSupported(org.springframework.web.HttpRequestMethodNotSupportedException ex) {
        return buildResponse(HttpStatus.METHOD_NOT_ALLOWED, "Method Not Allowed", ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Lỗi hệ thống",
                "Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau.");
    }

    private ResponseEntity<Map<String, Object>> buildResponse(HttpStatus status, String error, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", status.value());
        body.put("error", error);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
