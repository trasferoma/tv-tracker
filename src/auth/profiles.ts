export type GenderIcon = 'male' | 'female';

export interface UserProfile {
    readonly id: string;
    readonly displayName: string;
    readonly genderIcon: GenderIcon;
}

export const userProfiles: readonly UserProfile[] = [
    { id: 'fabio', displayName: 'Fabio', genderIcon: 'male' },
    { id: 'irene', displayName: 'Irene', genderIcon: 'female' }
];

export function findProfileById(id: string): UserProfile | undefined {
    return userProfiles.find((profile) => profile.id === id);
}
