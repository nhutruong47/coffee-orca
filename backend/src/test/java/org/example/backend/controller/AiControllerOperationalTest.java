package org.example.backend.controller;

import org.example.backend.entity.User;
import org.example.backend.repository.TeamMemberRepository;
import org.example.backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class AiControllerOperationalTest {
    @Test void unauthorizedTeamNeverLoadsMembersOrCallsAi() {
        var client = mock(AiServiceClient.class);
        var members = mock(TeamMemberRepository.class);
        var access = mock(AccessControlService.class);
        var controller = new AiController(client, members, access);
        UUID teamId = UUID.randomUUID();
        User user = new User(); user.setId(UUID.randomUUID());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null));
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN))
                .when(access).requireTeamMember(user, teamId);
        try {
            assertThrows(ResponseStatusException.class, () -> controller.parseText(Map.of("text", "Roast", "teamId", teamId.toString())));
            verifyNoInteractions(client, members);
        } finally { SecurityContextHolder.clearContext(); }
    }
}
