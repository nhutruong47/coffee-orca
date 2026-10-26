package org.example.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.jpa.show-sql=false")
@AutoConfigureMockMvc
@Transactional
class AttendanceEvidenceIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired TeamRepository teams;
    @Autowired TeamMemberRepository members;
    User owner;
    User employee;
    Team team;

    @BeforeEach
    void setup() {
        owner = persistUser("owner");
        employee = persistUser("worker");
        team = new Team(); team.setName("Xưởng kiểm thử"); team.setOwner(owner); team = teams.save(team);
        addMember(owner, GroupRole.ADMIN);
        addMember(employee, GroupRole.MEMBER);
    }

    private User persistUser(String prefix) {
        User row = new User(); row.setUsername(prefix + UUID.randomUUID());
        row.setPassword("test-only-unused"); return users.save(row);
    }

    private void addMember(User person, GroupRole role) {
        TeamMember m = new TeamMember(); m.setTeam(team); m.setUser(person); m.setGroupRole(role); members.save(m);
    }

    @Test
    void employeeCannotChangeWorkshopSettings() throws Exception {
        mvc.perform(put("/api/attendance/settings/" + team.getId()).with(user(employee))
                .contentType("application/json").content("{\"hourlyRateVnd\":1000000}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void optionalMissingEvidenceRemainsUnverifiedAndNoPayForOpenShift() throws Exception {
        mvc.perform(post("/api/attendance/check-in/" + team.getId()).with(user(employee))
                .contentType("application/json").content("{\"shiftType\":\"NGAY\",\"stage\":\"QA\",\"locationUnavailableReason\":\"Không cho phép GPS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").isEmpty())
                .andExpect(jsonPath("$.locationVerified").isEmpty())
                .andExpect(jsonPath("$.locationStatus").value("UNVERIFIED"))
                .andExpect(jsonPath("$.hasCheckInPhoto").value(false))
                .andExpect(jsonPath("$.totalPayVnd").value(0));
    }

    @Test
    void duplicateCheckInIsRejectedAndOptionalGpsIsReallyComparedWithConfiguredRadius() throws Exception {
        mvc.perform(put("/api/attendance/settings/" + team.getId()).with(user(owner))
                .contentType("application/json").content("{\"workshopLat\":10.762622,\"workshopLng\":106.660172,\"allowedRadiusMeters\":100}"))
                .andExpect(status().isOk());
        String body = "{\"latitude\":10.762622,\"longitude\":106.660172,\"accuracyMeters\":8}";
        mvc.perform(post("/api/attendance/check-in/" + team.getId()).with(user(employee)).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.locationStatus").value("WITHIN_RADIUS"))
                .andExpect(jsonPath("$.locationVerified").value(true)).andExpect(jsonPath("$.distanceMeters").value(0));
        mvc.perform(post("/api/attendance/check-in/" + team.getId()).with(user(employee)).contentType("application/json").content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void employeeCannotReadTeamRecordsOrBatchCreateTime() throws Exception {
        mvc.perform(get("/api/attendance/team-daily/" + team.getId()).with(user(employee))).andExpect(status().isForbidden());
        mvc.perform(get("/api/production/board/" + team.getId() + "/workforce").with(user(employee))).andExpect(status().isForbidden());
        mvc.perform(post("/api/attendance/quick-batch/" + team.getId()).with(user(owner)).contentType("application/json").content("{}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void configuredRequiredLocationRejectsMissingGps() throws Exception {
        mvc.perform(put("/api/attendance/settings/" + team.getId()).with(user(owner))
                .contentType("application/json").content(json.writeValueAsBytes(Map.of(
                        "workshopLat", 10.762622, "workshopLng", 106.660172,
                        "requireLocation", true, "allowedRadiusMeters", 100))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/attendance/check-in/" + team.getId()).with(user(employee))
                .contentType("application/json").content("{\"shiftType\":\"NGAY\",\"stage\":\"QA\"}"))
                .andExpect(status().isBadRequest());
    }
}
