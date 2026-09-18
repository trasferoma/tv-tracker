function buildFallbackUuid(): string {
    const randomBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(randomBytes);
    randomBytes[6] = (randomBytes[6]! & 0x0f) | 0x40;
    randomBytes[8] = (randomBytes[8]! & 0x3f) | 0x80;
    const hexBytes = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0'));
    const hex = hexBytes.join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return buildFallbackUuid();
}
