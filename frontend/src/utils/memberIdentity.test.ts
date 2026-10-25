import { describe, expect, it } from 'vitest';
import type { TeamMemberInfo } from '../types/types';
import {
    formatMemberIdentity,
    getDuplicateMemberNameKeys,
    getMemberCode,
    hasDuplicateMemberName,
} from './memberIdentity';

const member = (overrides: Partial<TeamMemberInfo>): TeamMemberInfo => ({
    userId: '4a3e42fa-1234-5678-9012-abcdefabcdef',
    username: 'nguyen.van.an',
    fullName: 'Nguyễn Văn An',
    groupRole: 'MEMBER',
    joinedAt: '2026-08-12',
    ...overrides,
});

describe('member identity', () => {
    it('builds a stable readable identity from the unique user id', () => {
        expect(getMemberCode(member({}).userId)).toBe('NV-4A3E42FA');
        expect(formatMemberIdentity(member({}))).toBe('Nguyễn Văn An · @nguyen.van.an · NV-4A3E42FA');
    });

    it('detects duplicate display names despite accents, case and extra spaces', () => {
        const first = member({ userId: '11111111-aaaa', fullName: 'Nguyễn  Văn An' });
        const second = member({ userId: '22222222-bbbb', username: 'an.nguyen.2', fullName: 'NGUYEN VAN AN' });
        const duplicates = getDuplicateMemberNameKeys([first, second]);

        expect(hasDuplicateMemberName(first, duplicates)).toBe(true);
        expect(hasDuplicateMemberName(second, duplicates)).toBe(true);
    });

    it('does not treat the same job label as a duplicate identity', () => {
        const first = member({ userId: '11111111-aaaa', fullName: 'Nguyễn Văn An', jobLabels: ['RANG'] });
        const second = member({ userId: '22222222-bbbb', username: 'tran.van.binh', fullName: 'Trần Văn Bình', jobLabels: ['RANG'] });

        expect(getDuplicateMemberNameKeys([first, second]).size).toBe(0);
    });
});
