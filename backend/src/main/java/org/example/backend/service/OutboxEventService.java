package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.entity.OutboxEvent;
import org.example.backend.repository.OutboxEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class OutboxEventService {

    private static final Logger log = LoggerFactory.getLogger(OutboxEventService.class);

    private final OutboxEventRepository outboxRepo;
    private final ObjectMapper objectMapper;

    public OutboxEventService(OutboxEventRepository outboxRepo, ObjectMapper objectMapper) {
        this.outboxRepo = outboxRepo;
        this.objectMapper = objectMapper;
    }

    /**
     * Publishes an event within the SAME transactional boundary as the business entity.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxEvent publish(String aggregateType, String aggregateId, String eventType, Object payloadObj) {
        String payloadJson = "";
        try {
            payloadJson = objectMapper.writeValueAsString(payloadObj);
        } catch (Exception e) {
            log.error("Failed to serialize outbox event payload for {} #{}", aggregateType, aggregateId, e);
            payloadJson = String.valueOf(payloadObj);
        }

        OutboxEvent event = OutboxEvent.builder()
                .aggregateType(aggregateType)
                .aggregateId(aggregateId)
                .eventType(eventType)
                .payload(payloadJson)
                .status("PENDING")
                .retryCount(0)
                .build();

        return outboxRepo.save(event);
    }

    /**
     * Background Poller that dispatches pending outbox events asynchronously.
     */
    @Scheduled(fixedDelayString = "${app.outbox.poll-rate:5000}")
    @Transactional
    public void processPendingEvents() {
        List<OutboxEvent> pending = outboxRepo.findByStatusOrderByCreatedAtAsc("PENDING", PageRequest.of(0, 50));
        if (pending.isEmpty()) return;

        for (OutboxEvent event : pending) {
            try {
                // Event dispatch logic (can forward to STOMP WebSocket, Email, or external Webhooks)
                log.debug("Dispatching outbox event [{} - {}] for #{}", event.getEventType(), event.getAggregateType(), event.getAggregateId());
                
                event.setStatus("PROCESSED");
                event.setProcessedAt(LocalDateTime.now());
                outboxRepo.save(event);
            } catch (Exception e) {
                log.error("Error dispatching outbox event #{}", event.getId(), e);
                event.setRetryCount(event.getRetryCount() + 1);
                event.setErrorMessage(e.getMessage());
                if (event.getRetryCount() >= 5) {
                    event.setStatus("DEAD_LETTER");
                }
                outboxRepo.save(event);
            }
        }
    }
}
