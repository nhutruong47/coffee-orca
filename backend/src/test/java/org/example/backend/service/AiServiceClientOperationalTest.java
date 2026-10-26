package org.example.backend.service;

import org.example.backend.dto.AiParseResult;
import org.example.backend.repository.InventoryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.UUID;

class AiServiceClientOperationalTest {
    @Test
    void promptReportsOnlyOpenShiftsIncludingOvernightAndEmptyInventory() throws Exception {
        InventoryRepository inventory = mock(InventoryRepository.class);
        var attendance = mock(org.example.backend.repository.AttendanceRepository.class);
        AiServiceClient client = new AiServiceClient(inventory);
        ReflectionTestUtils.setField(client, "attendanceRepository", attendance);
        ReflectionTestUtils.setField(client, "geminiApiKey", "test-not-a-real-key");
        ReflectionTestUtils.setField(client, "aiServiceEnvFile", null);
        var rest = (org.springframework.web.client.RestTemplate) ReflectionTestUtils.getField(client, "restTemplate");
        var server = org.springframework.test.web.client.MockRestServiceServer.bindTo(rest).build();
        UUID teamId = UUID.randomUUID();
        when(attendance.findByTeamIdAndDateBetween(eq(teamId), any(), any())).thenReturn(java.util.List.of());
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.anything())
                .andExpect(request -> {
                    String body = ((org.springframework.mock.http.client.MockClientHttpRequest) request).getBodyAsString();
                    assertTrue(body.contains("KHÔNG CÓ NHÂN SỰ KHẢ DỤNG"));
                    assertTrue(body.contains("KHO TRỐNG"));
                }).andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess(
                        "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{\\\"title\\\":\\\"Draft\\\",\\\"tasks\\\":[]}\"}]}}]}",
                        org.springframework.http.MediaType.APPLICATION_JSON));
        client.parseTask("Roast 100 kg", teamId);
        server.verify();
    }
    @Test
    void unavailableAiNeverInventsRunnableTasks() {
        AiServiceClient client = new AiServiceClient(mock(InventoryRepository.class));
        ReflectionTestUtils.setField(client, "aiServiceEnvFile", null);
        AiParseResult result = client.parseTask("Roast 100 kg", UUID.randomUUID());
        assertTrue(Boolean.TRUE.equals(result.getNeedsClarification()));
        assertTrue(result.getTasks() == null || result.getTasks().isEmpty());
        assertEquals("unavailable", result.getSource());
    }
}
