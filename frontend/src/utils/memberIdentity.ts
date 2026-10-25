import type { TeamMemberInfo } from '../types/types';

type MemberIdentity = Pick<TeamMemberInfo, 'userId' | 'username' | 'fullName'>;

export function normalizeMemberName(value: string | null | undefined) {
    return (value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('vi-VN');
}

export function getMemberDisplayName(member: MemberIdentity) {
    return member.fullName?.trim() || member.username?.trim() || 'Thành viên';
}

export function getMemberCode(userId: string) {
    const compactId = (userId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `NV-${compactId.slice(0, 8) || 'CHUARÕ'}`;
}

export function formatMemberIdentity(member: MemberIdentity) {
    const displayName = getMemberDisplayName(member);
    const username = member.username?.trim();
    const identityParts = [displayName];

    if (username && normalizeMemberName(username) !== normalizeMemberName(displayName)) {
        identityParts.push(`@${username}`);
    }

    identityParts.push(getMemberCode(member.userId));
    return identityParts.join(' · ');
}

export function getDuplicateMemberNameKeys(members: MemberIdentity[]) {
    const nameCounts = new Map<string, number>();

    members.forEach(member => {
        const normalizedName = normalizeMemberName(getMemberDisplayName(member));
        if (normalizedName) {
            nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
        }
    });

    return new Set(
        [...nameCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([name]) => name)
    );
}

export function hasDuplicateMemberName(member: MemberIdentity, duplicateNameKeys: Set<string>) {
    return duplicateNameKeys.has(normalizeMemberName(getMemberDisplayName(member)));
}
