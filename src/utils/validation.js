
export function validateAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateTokenId(tokenId, max) {
    const id = Number(tokenId);
    return !isNaN(id) && id >= 0 && (max ? id < max : true);
}

export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>'"]/g, '');
}
