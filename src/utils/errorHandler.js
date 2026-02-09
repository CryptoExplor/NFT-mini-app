
export class MintError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

export function handleMintError(error) {
    console.error('Mint Error:', error);

    const userFriendlyMessages = {
        'insufficient_funds': 'Insufficient funds for this transaction',
        'user_rejected': 'Transaction cancelled',
        'wallet_limit': 'You have reached your wallet limit',
        'sold_out': 'Collection is sold out',
        'wrong_network': 'Please switch to Base network',
        'execution_reverted': 'Transaction failed: Execution reverted'
    };

    // Check for common error patterns in error message strings if code is not present
    let errorCode = error.code;
    if (!errorCode) {
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('user rejected') || msg.includes('user denied')) errorCode = 'user_rejected';
        else if (msg.includes('insufficient funds')) errorCode = 'insufficient_funds';
        else if (msg.includes('network')) errorCode = 'wrong_network';
    }

    return userFriendlyMessages[errorCode] || error.message || 'Something went wrong. Please try again.';
}
