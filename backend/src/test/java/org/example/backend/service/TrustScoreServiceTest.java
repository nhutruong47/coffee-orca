package org.example.backend.service;

import org.example.backend.entity.Team;
import org.example.backend.entity.User;
import org.example.backend.repository.TeamRepository;
import org.example.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Unit test cho TrustScoreService — pure logic, không cần Spring context.
 *
 * <p>Đặc biệt quan trọng: kiểm tra công thức thống nhất giữa Team và User
 * (trước đây Team dùng completed/total còn User dùng completed/(completed+cancelled)).
 */
class TrustScoreServiceTest {

    private TeamRepository teamRepo;
    private UserRepository userRepo;
    private TrustScoreService service;

    @BeforeEach
    void setUp() {
        teamRepo = mock(TeamRepository.class);
        userRepo = mock(UserRepository.class);
        service = new TrustScoreService(teamRepo, userRepo);
    }

    private Team team(int completed, int cancelled) {
        Team t = new Team();
        t.setId(UUID.randomUUID());
        t.setCompletedOrders(completed);
        t.setCancelledOrders(cancelled);
        when(teamRepo.findById(t.getId())).thenReturn(java.util.Optional.of(t));
        return t;
    }

    private User user(int completed, int cancelled) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setCompletedOrders(completed);
        u.setCancelledOrders(cancelled);
        when(userRepo.findById(u.getId())).thenReturn(java.util.Optional.of(u));
        return u;
    }

    @Test
    @DisplayName("Team mới (0 completed, 0 cancelled) → trustScore = -1 (chưa có dữ liệu)")
    void newTeam_hasFullTrust() {
        assertThat(service.calculate(team(0, 0))).isEqualTo(-1);
    }

    @Test
    @DisplayName("Team 8 completed, 2 cancelled → capped at 100")
    void team_eightOfTen() {
        assertThat(service.calculate(team(8, 2))).isEqualTo(100);
    }

    @Test
    @DisplayName("Team 0 completed, 5 cancelled → 0%")
    void team_allCancelled_zeroTrust() {
        assertThat(service.calculate(team(0, 5))).isEqualTo(0);
    }

    @Test
    @DisplayName("User 6 completed, 4 cancelled → 80%")
    void user_sixOfTen() {
        assertThat(service.calculate(user(6, 4))).isEqualTo(80);
    }

    @Test
    @DisplayName("User mới → -1")
    void newUser_hasFullTrust() {
        assertThat(service.calculate(user(0, 0))).isEqualTo(-1);
    }

    @Test
    @DisplayName("null Team → 0 (không NPE)")
    void nullTeam_returnsZero() {
        assertThat(service.calculate((Team) null)).isEqualTo(0);
    }

    @Test
    @DisplayName("null User → 0")
    void nullUser_returnsZero() {
        assertThat(service.calculate((User) null)).isEqualTo(0);
    }

    @Test
    @DisplayName("Công thức thống nhất: Team(7,3) và User(7,3) cùng cho 70%")
    void teamAndUser_useSameFormula() {
        assertThat(service.calculate(team(7, 3))).isEqualTo(service.calculate(user(7, 3)));
    }

    @Test
    @DisplayName("onOrderCancelled(Team) tăng cancelledOrders và save")
    void onOrderCancelled_team() {
        Team t = team(5, 1);
        service.onOrderCancelled(t, null);
        assertThat(t.getCancelledOrders()).isEqualTo(2);
        verify(teamRepo).save(t);
    }

    @Test
    @DisplayName("onOrderCancelled(User) tăng cancelledOrders và save")
    void onOrderCancelled_user() {
        User u = user(3, 0);
        service.onOrderCancelled(null, u);
        assertThat(u.getCancelledOrders()).isEqualTo(1);
        verify(userRepo).save(u);
    }

    @Test
    @DisplayName("onOrderCancelled với cả 2 null → no-op, không save")
    void onOrderCancelled_nullBoth() {
        service.onOrderCancelled(null, null);
        verifyNoInteractions(teamRepo, userRepo);
    }

    @Test
    @DisplayName("onRatingSubmitted ON_TIME → tăng onTimeOrders, totalRatings, sumRatings")
    void onRatingSubmitted_onTime() {
        Team t = team(0, 0);
        service.onRatingSubmitted(t, 4, "ON_TIME");
        assertThat(t.getOnTimeOrders()).isEqualTo(1);
        assertThat(t.getLateOrders()).isEqualTo(0);
        assertThat(t.getTotalRatings()).isEqualTo(1);
        assertThat(t.getSumRatings()).isEqualTo(4.0);
    }

    @Test
    @DisplayName("onRatingSubmitted LATE → tăng lateOrders")
    void onRatingSubmitted_late() {
        Team t = team(0, 0);
        service.onRatingSubmitted(t, 2, "LATE");
        assertThat(t.getOnTimeOrders()).isEqualTo(0);
        assertThat(t.getLateOrders()).isEqualTo(1);
    }

    @Test
    @DisplayName("averageRating = sumRatings / totalRatings")
    void averageRating() {
        Team t = new Team();
        t.setTotalRatings(3);
        t.setSumRatings(12.0);
        assertThat(service.averageRating(t)).isEqualTo(4.0);
    }

    @Test
    @DisplayName("averageRating null khi chưa có rating")
    void averageRating_nullWhenEmpty() {
        assertThat(service.averageRating(team(0, 0))).isNull();
    }

    @Test
    @DisplayName("safelyCalculate hỗ trợ cả Team và User (polymorphic)")
    void safelyCalculate_polymorphic() {
        Team t = team(5, 5);
        User u = user(5, 5);
        assertThat(service.safelyCalculate(t)).isEqualTo(50);
        assertThat(service.safelyCalculate(u)).isEqualTo(50);
        assertThat(service.safelyCalculate("not a person")).isEqualTo(0);
    }
}
