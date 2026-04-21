// Shim for @wagmi/core/tempo — tempoWallet doesn't exist in the installed
// version of @wagmi/core, but @wagmi/connectors tries to import it.
// Exporting a no-op keeps Rollup happy at build time.
export const tempoWallet = () => null;