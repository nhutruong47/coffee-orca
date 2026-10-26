package org.example.backend.repository;

import org.example.backend.entity.TeamMember;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TeamMemberRepository extends JpaRepository<TeamMember, UUID> {

    @EntityGraph(attributePaths = {"user", "team", "jobLabels"})
    List<TeamMember> findByTeamId(UUID teamId);

    @EntityGraph(attributePaths = {"user", "team", "jobLabels"})
    List<TeamMember> findByUserId(UUID userId);

    @EntityGraph(attributePaths = {"user", "team", "jobLabels"})
    Optional<TeamMember> findByTeamIdAndUserId(UUID teamId, UUID userId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select tm from TeamMember tm where tm.team.id = :teamId and tm.user.id = :userId")
    Optional<TeamMember> lockByTeamAndUser(@Param("teamId") UUID teamId, @Param("userId") UUID userId);

    boolean existsByTeamIdAndUserId(UUID teamId, UUID userId);

    @Query("select count(distinct tm.user.id) from TeamMember tm where tm.team.owner.id = :ownerId")
    long countDistinctUsersByTeamOwnerId(@Param("ownerId") UUID ownerId);

    @Query("select case when count(tm) > 0 then true else false end from TeamMember tm "
            + "where tm.user.id = :userId and tm.team.owner.id = :ownerId")
    boolean existsByUserIdAndTeamOwnerId(
            @Param("userId") UUID userId,
            @Param("ownerId") UUID ownerId);

    void deleteByTeamIdAndUserId(UUID teamId, UUID userId);
}
