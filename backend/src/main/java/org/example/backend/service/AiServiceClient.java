package org.example.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.dto.AiParseResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import org.example.backend.repository.TeamMemberRepository;
import org.example.backend.repository.InventoryRepository;
import org.example.backend.entity.InventoryItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class AiServiceClient {

    private static final Logger logger = LoggerFactory.getLogger(AiServiceClient.class);

    @Value("${ai.service.api-key:}")
    private String geminiApiKey;

    @Value("${ai.service.model:${GEMINI_MODEL:gemini-2.5-flash-lite}}")
    private String geminiModel;

    @Value("${ai.service.env-file:${AI_SERVICE_ENV_FILE:../../ai-service/.env}}")
    private String aiServiceEnvFile;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    private final InventoryRepository inventoryRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.example.backend.repository.AttendanceRepository attendanceRepository;

    public AiServiceClient(InventoryRepository inventoryRepository) {
        this.inventoryRepository = inventoryRepository;
    }

    @jakarta.annotation.PostConstruct
    public void init() {
        if (this.geminiApiKey != null) {
            this.geminiApiKey = this.geminiApiKey.trim();
            logger.info("DEBUG AiServiceClient - Gemini API Key Initialized, Length: {}", this.geminiApiKey.length());
        } else {
            logger.error("DEBUG AiServiceClient - Gemini API Key is MISSING!");
        }
        if (this.geminiModel != null) {
            this.geminiModel = this.geminiModel.trim();
        }
        if (this.aiServiceEnvFile != null) {
            this.aiServiceEnvFile = this.aiServiceEnvFile.trim();
        }
        logger.info("DEBUG AiServiceClient - Gemini Model: {}", resolveGeminiModel());
    }

    public AiParseResult generateTaskPlan(String outputTarget, String deadline, Integer priority,
            UUID teamId, Map<String, List<String>> memberLabels) {
        String input = outputTarget;
        if (deadline != null && !deadline.isEmpty()) {
            input += ", hạn chót: " + deadline;
        }

        StringBuilder context = new StringBuilder();
        if (memberLabels != null && !memberLabels.isEmpty()) {
            context.append("--- DANH SÁCH NHÂN SỰ ---\n");
            for (Map.Entry<String, List<String>> entry : memberLabels.entrySet()) {
                String name = entry.getKey();
                List<String> labels = entry.getValue();
                context.append("- ").append(name);
                if (labels != null && !labels.isEmpty()) {
                    context.append(" (Kỹ năng/Nhãn: ").append(String.join(", ", labels)).append(")");
                } else {
                    context.append(" (Chưa gán nhãn)");
                }
                context.append("\n");
            }
        }

        if (teamId != null) {
            List<InventoryItem> items = inventoryRepository.findByTeamIdOrderByLastUpdatedDesc(teamId);
            if (!items.isEmpty()) {
                context.append("\n--- TÌNH TRẠNG KHO HIỆN TẠI ---\n");
                for (InventoryItem item : items) {
                    context.append("- ").append(item.getName())
                           .append(": ").append(item.getQuantity()).append(" ").append(item.getUnit())
                           .append(" (Trạng thái: ").append(item.getStockStatus()).append(")\n");
                }
            }
        }

        return parseTask(input, teamId, context.toString(), null);
    }

    public AiParseResult parseTask(String text, java.util.UUID teamId) {
        return parseTask(text, teamId, null, null);
    }

    public AiParseResult parseTask(String text, java.util.UUID teamId, String memberContext, String historyContext) {
        if (teamId == null) throw new IllegalArgumentException("teamId is required");
        if (text == null || text.isBlank()) throw new IllegalArgumentException("text is required");
        StringBuilder facts = new StringBuilder("\n--- TÌNH TRẠNG KHO HIỆN TẠI ---\n");
        List<InventoryItem> items = inventoryRepository.findByTeamIdOrderByLastUpdatedDesc(teamId);
        if (items.isEmpty()) facts.append("KHO TRỐNG: Không có nguyên liệu được ghi nhận. Không được giả định đủ kho.\n");
        for (InventoryItem item : items) {
            facts.append("- ").append(item.getProductType()).append(" / ").append(item.getProductState())
                    .append(": ").append(item.getQuantity()).append(" ").append(item.getUnit()).append("\n");
        }
        facts.append("Chỉ dùng đúng loại sản phẩm và trạng thái, không cộng đơn vị khác nhau. "
                + "Hao hụt rang 15%: nhân xanh = thành phẩm / 0.85. Cảnh báo rõ nếu không đủ nguyên liệu.\n");
        facts.append("--- NHÂN SỰ KHẢ DỤNG TRONG CA ĐANG MỞ ---\n");
        if (attendanceRepository != null) {
            var available = AiOperationalContext.available(attendanceRepository, teamId, java.time.LocalDateTime.now());
            if (available.isEmpty()) facts.append("KHÔNG CÓ NHÂN SỰ KHẢ DỤNG. Không tự phân công người chưa có mặt.\n");
            for (var a : available) {
                facts.append("- ").append(a.getUser().getUsername()).append(" (Ca: ").append(a.getShiftType())
                        .append(", Công đoạn: ").append(a.getStage()).append(")\n");
            }
        } else facts.append("Chưa xác minh được nhân sự khả dụng.\n");
        facts.append("Danh sách thành viên/nhãn chỉ mô tả kỹ năng, không chứng minh đang có mặt. "
                + "Chỉ phân công ca hiện tại cho nhân sự khả dụng; lịch ca tương lai cần xác nhận.\n");
        String inventoryContext = facts.toString();

        AiParseResult result = null;
        String apiKey = resolveGeminiApiKey();
        if (apiKey != null && !apiKey.isEmpty()) {
            try {
                result = parseWithGemini(text, memberContext, historyContext, inventoryContext, apiKey, resolveGeminiModel());
            } catch (Exception e) {
                logger.warn("AI provider unavailable ({})", e.getClass().getSimpleName());
                result = unavailableResult();
            }
        }
        if (result == null) {
            result = unavailableResult();
        }

        if (result.getTasks() == null) result.setTasks(Collections.emptyList());
        if (Boolean.TRUE.equals(result.getNeedsClarification())) result.setTasks(Collections.emptyList());
        
        return result;
    }

    private AiParseResult parseWithGemini(String text, String memberContext, String historyContext, String inventoryContext,
            String apiKey, String model) throws Exception {
        String memberSection = "";
        if (memberContext != null && !memberContext.isEmpty()) {
            memberSection = "\n--- DANH SÁCH THÀNH VIÊN VÀ NHÃN DÁN CÔNG VIỆC ---\n"
                    + memberContext + "\n"
                    + "PHÂN CÔNG: Dựa vào Job Labels để gán người phù hợp nhất vào trường 'assignee'.\n\n";
        }

        String historySection = "";
        if (historyContext != null && !historyContext.isEmpty()) {
            historySection = "\n--- LỊCH SỬ CHAT TRƯỚC ĐÓ ---\n"
                    + historyContext + "\n\n"
                    + "QUY TẮC CẬP NHẬT: Ưu tiên giữ cấu trúc kế hoạch cũ, chỉ thay đổi các thông tin người dùng vừa yêu cầu sửa đổi.\n";
        }

        String prompt = "HỆ THỐNG ĐIỀU PHỐI & GIAO VIỆC TỰ ĐỘNG\n"
                + "Vai trò: Bạn là nhân sự thông minh. Nhiệm vụ: Nhận yêu cầu, phân rã công việc và giao việc.\n\n"
                + "1. QUY TẮC TƯƠNG TÁC (Multi-turn):\n"
                + "- LUÔN bắt đầu phản hồi bằng lời chào: 'Chào anh/chị'.\n"
                + "- Xưng hô: Xưng là 'em', gọi User là 'anh/chị'.\n"
                + "- Nếu User thiếu thông tin TRỌNG YẾU (deadline, số lượng) hoặc yêu cầu chưa rõ ràng: Hãy khéo léo ĐẶT CÂU HỎI vào `description` để xin thêm thông tin và đặt `needsClarification` = true.\n"
                + "- LUÔN GỢI Ý CÂU HỎI (Proactive): Ngay cả khi đã có kế hoạch, hãy liệt kê 1-3 câu hỏi gợi ý để tối ưu kế hoạch vào mảng `suggestedQuestions` (ví dụ: 'Anh/chị có muốn bổ sung thông tin cho sản lượng không?', v.v.)\n"
                + "- Nếu User yêu cầu sửa đổi: Cập nhật trường tương ứng và giữ nguyên phần khác.\n"
                + "2. PHÂN RÃ CÔNG VIỆC:\n"
                + "- Trình bày BẢNG ROADMAP (markdown) trong `description` sau lời chào và câu hỏi.\n"
                + "- Từng task ghi rõ [Ca: Sáng/Chiều] ở đầu mô tả.\n\n"
                + "3. PHONG CÁCH: Lịch sự, chuyên nghiệp, hỗ trợ tận tâm.\n\n"
                + "--- CONTEXT ---\n"
                + memberSection
                + historySection
                + (inventoryContext != null ? inventoryContext : "")
                + "Định dạng JSON Phản hồi (BẮT BUỘC):\n"
                + "{\n"
                + "  \"title\": \"Tên mục tiêu\",\n"
                + "  \"description\": \"Câu trả lời hoặc Bảng roadmap\",\n"
                + "  \"quantity\": \"Số lượng\",\n"
                + "  \"quantityNumber\": 100,\n"
                + "  \"unit\": \"đơn vị\",\n"
                + "  \"deadline\": \"YYYY-MM-DD\",\n"
                + "  \"priority\": \"High/Medium/Low\",\n"
                + "  \"needsClarification\": false,\n"
                + "  \"suggestedQuestions\": [\"Câu hỏi 1?\", \"Câu hỏi 2?\"],\n"
                + "  \"tasks\": [\n"
                + "    { \"title\": \"...\", \"description\": \"[Ca: ...] ...\", \"workload\": 8.0, \"priority\": 2, \"assignee\": \"...\", \"backupMember\": \"...\" }\n"
                + "  ]\n"
                + "}\n"
                + "Yêu cầu mới nhất của User: \"" + text + "\"";

        Map<String, Object> requestBody = new HashMap<>();
        Map<String, Object> contentMap = new HashMap<>();
        Map<String, Object> partMap = new HashMap<>();
        partMap.put("text", prompt);
        contentMap.put("role", "user");
        contentMap.put("parts", Collections.singletonList(partMap));
        requestBody.put("contents", Collections.singletonList(contentMap));

        Map<String, Object> generationConfig = new HashMap<>();
        generationConfig.put("temperature", 0.2);
        generationConfig.put("responseMimeType", "application/json");
        requestBody.put("generationConfig", generationConfig);

        String url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
        
        String requestJson = objectMapper.writeValueAsString(requestBody);
        HttpEntity<String> entity = new HttpEntity<>(requestJson, headers);

        String responseBody;
        try {
            logger.info("📡 Calling Gemini API model: {}", model);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            responseBody = response.getBody();
        } catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests e) {
            logger.error("🛑 Gemini Rate Limit (429) hit: {}", e.getResponseBodyAsString());
            throw new Exception("Hệ thống đang quá tải (Rate limit). Vui lòng thử lại sau giây lát.");
        } catch (Exception e) {
            logger.error("❌ Gemini Call Exception: {}", e.getMessage());
            throw e;
        }

        if (responseBody == null || responseBody.isBlank()) {
            throw new Exception("Gemini API returned an empty response.");
        }

        JsonNode rootNode;
        try {
            rootNode = objectMapper.readTree(responseBody);
        } catch (Exception e) {
            logger.error("❌ Failed to parse Gemini response as JSON. Body preview: {}", 
                responseBody.substring(0, Math.min(responseBody.length(), 500)));
            throw new Exception("Lỗi xử lý phản hồi từ AI. Bản tin không đúng định dạng.");
        }

        JsonNode candidate = rootNode.path("candidates").get(0);
        if (candidate.isMissingNode()) {
            logger.error("❌ No candidates in Gemini response: {}", responseBody);
            throw new Exception("AI không đưa ra phản hồi phù hợp.");
        }

        String responseText = candidate.path("content").path("parts").get(0).path("text").asText();

        String jsonStr = responseText.trim();
        if (jsonStr.startsWith("```json")) jsonStr = jsonStr.substring(7).trim();
        if (jsonStr.endsWith("```")) jsonStr = jsonStr.substring(0, jsonStr.length() - 3).trim();

        return objectMapper.readValue(jsonStr, AiParseResult.class);
    }

    private String resolveGeminiApiKey() {
        String configuredKey = normalizeConfigValue(geminiApiKey);
        if (configuredKey != null) {
            return configuredKey;
        }
        return normalizeConfigValue(readDotEnvValue("GEMINI_API_KEY"));
    }

    private String resolveGeminiModel() {
        String dotenvModel = normalizeConfigValue(readDotEnvValue("GEMINI_MODEL"));
        if (dotenvModel != null) {
            return dotenvModel;
        }
        String configuredModel = normalizeConfigValue(geminiModel);
        return configuredModel != null ? configuredModel : "gemini-2.5-flash-lite";
    }

    private String normalizeConfigValue(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if ((normalized.startsWith("\"") && normalized.endsWith("\""))
                || (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.substring(1, normalized.length() - 1).trim();
        }
        if (normalized.isEmpty() || "your_api_key_here".equalsIgnoreCase(normalized)) {
            return null;
        }
        return normalized;
    }

    private String readDotEnvValue(String key) {
        String envPath = normalizeConfigValue(aiServiceEnvFile);
        if (envPath == null) {
            return null;
        }
        try {
            Path path = Path.of(envPath);
            if (!path.isAbsolute()) {
                path = Path.of("").toAbsolutePath().resolve(path).normalize();
            }
            if (!Files.exists(path)) {
                return null;
            }
            String value = null;
            for (String line : Files.readAllLines(path)) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                int index = trimmed.indexOf('=');
                if (index <= 0) {
                    continue;
                }
                String name = trimmed.substring(0, index).trim();
                if (key.equals(name)) {
                    value = trimmed.substring(index + 1).trim();
                }
            }
            return value;
        } catch (Exception e) {
            logger.warn("Could not read AI service .env file '{}': {}", envPath, e.getMessage());
            return null;
        }
    }

    private AiParseResult unavailableResult() {
        AiParseResult result = new AiParseResult();
        result.setSource("unavailable");
        result.setTitle("AI không khả dụng");
        result.setDescription("Không thể lập kế hoạch AI. Vui lòng thử lại sau hoặc lập kế hoạch thủ công.");
        result.setNeedsClarification(true);
        result.setTasks(Collections.emptyList());
        return result;
    }
}
