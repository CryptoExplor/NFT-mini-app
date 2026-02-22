/**
 * Contract Actions
 * Config-driven non-mint interactions per collection.
 */

import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { DATA_SUFFIX, wagmiAdapter } from '../wallet.js';
import { getContractConfig } from '../../contracts/index.js';
import { parseEther, parseUnits } from 'viem';

const ACTION_TYPES = new Set(['CONTRACT_CALL', 'TRANSFER', 'SEND_TO_DEAD']);
const DEFAULT_DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const DEFAULT_NATIVE_VALUE_INPUT_KEY = '__nativeValue';
const BLOCKED_AUTO_FUNCTION_NAMES = new Set([
    'mint',
    'freemint',
    'paidmint',
    'publicmint',
    'burnmint',
    'claim',
    'transferfrom',
    'safetransferfrom',
    'approve',
    'setapprovalforall',
    'getapproved',
    'isapprovedforall',
    'balanceof',
    'ownerof',
    'name',
    'symbol',
    'tokenuri',
    'supportsinterface',
    'totalsupply',
    'totalminted',
    'mintedby',
    'owner',
    'contracturi'
]);
const BLOCKED_AUTO_FUNCTION_PREFIXES = [
    'set',
    'update',
    'configure',
    'initialize',
    'init',
    'pause',
    'unpause',
    'withdraw',
    'sweep',
    'rescue',
    'transferownership',
    'renounce',
    'grant',
    'revoke'
];

function isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(address || ''));
}

function toActionId(raw, index) {
    const normalized = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (normalized) return normalized;
    return `action-${index + 1}`;
}

function normalizeArg(arg, index) {
    if (!arg || typeof arg !== 'object') {
        return {
            key: `arg${index}`,
            label: `Arg ${index + 1}`,
            type: 'string',
            required: true
        };
    }

    const key = String(arg.key || arg.name || `arg${index}`);
    return {
        key,
        label: String(arg.label || key),
        type: String(arg.type || 'string'),
        placeholder: arg.placeholder ? String(arg.placeholder) : '',
        required: arg.required !== false,
        value: arg.value,
        hidden: arg.hidden === true
    };
}

function getDefaultArgs(type) {
    if (type === 'TRANSFER') {
        return [
            { key: 'tokenId', label: 'Token ID', type: 'uint256', placeholder: 'e.g. 1', required: true },
            { key: 'to', label: 'Recipient Address', type: 'address', placeholder: '0x...', required: true }
        ];
    }

    if (type === 'SEND_TO_DEAD') {
        return [
            { key: 'tokenId', label: 'Token ID', type: 'uint256', placeholder: 'e.g. 1', required: true }
        ];
    }

    return [];
}

function getDefaultCollectionActions() {
    return [
        {
            id: 'transfer',
            type: 'TRANSFER',
            label: 'Transfer NFT',
            description: 'Send NFT to another wallet address.',
            successMessage: 'NFT transferred'
        },
        {
            id: 'send-to-dead',
            type: 'SEND_TO_DEAD',
            label: 'Send to Dead Address',
            description: 'Permanently remove NFT by sending it to 0x...dEaD.',
            successMessage: 'NFT sent to dead address'
        }
    ];
}

function normalizeValueConfig(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;

    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'bigint') {
        return {
            mode: 'static',
            unit: 'wei',
            value: String(rawValue),
            inputKey: '',
            label: '',
            placeholder: '',
            required: true
        };
    }

    if (typeof rawValue !== 'object') return null;

    if (rawValue.inputKey) {
        const unit = String(rawValue.unit || 'eth').toLowerCase() === 'wei' ? 'wei' : 'eth';
        return {
            mode: 'input',
            unit,
            value: '',
            inputKey: String(rawValue.inputKey),
            label: String(rawValue.label || (unit === 'wei' ? 'Native Value (wei)' : 'Native Value (ETH)')),
            placeholder: String(rawValue.placeholder || (unit === 'wei' ? 'e.g. 1000000000000000' : 'e.g. 0.001')),
            required: rawValue.required !== false
        };
    }

    if (rawValue.value !== undefined && rawValue.value !== null && String(rawValue.value).trim() !== '') {
        const unit = String(rawValue.unit || 'wei').toLowerCase() === 'eth' ? 'eth' : 'wei';
        return {
            mode: 'static',
            unit,
            value: String(rawValue.value),
            inputKey: '',
            label: '',
            placeholder: '',
            required: true
        };
    }

    if (rawValue.wei !== undefined && rawValue.wei !== null && String(rawValue.wei).trim() !== '') {
        return {
            mode: 'static',
            unit: 'wei',
            value: String(rawValue.wei),
            inputKey: '',
            label: '',
            placeholder: '',
            required: true
        };
    }

    if (rawValue.eth !== undefined && rawValue.eth !== null && String(rawValue.eth).trim() !== '') {
        return {
            mode: 'static',
            unit: 'eth',
            value: String(rawValue.eth),
            inputKey: '',
            label: '',
            placeholder: '',
            required: true
        };
    }

    return null;
}

function normalizeApprovalConfig(rawApproval) {
    if (!rawApproval || typeof rawApproval !== 'object') return null;
    if (!rawApproval.tokenAddress) return null;

    const decimals = Number.isFinite(Number(rawApproval.decimals))
        ? Math.max(0, Number(rawApproval.decimals))
        : 18;

    return {
        tokenAddress: String(rawApproval.tokenAddress),
        spender: rawApproval.spender ? String(rawApproval.spender) : '',
        amount: rawApproval.amount !== undefined && rawApproval.amount !== null ? String(rawApproval.amount) : '',
        amountWei: rawApproval.amountWei !== undefined && rawApproval.amountWei !== null ? String(rawApproval.amountWei) : '',
        amountInputKey: rawApproval.amountInputKey ? String(rawApproval.amountInputKey) : '',
        amountLabel: rawApproval.amountLabel ? String(rawApproval.amountLabel) : '',
        amountPlaceholder: rawApproval.amountPlaceholder ? String(rawApproval.amountPlaceholder) : '',
        decimals,
        required: rawApproval.required !== false,
        resetToZeroFirst: rawApproval.resetToZeroFirst === true
    };
}

function toTitleCaseLabel(raw) {
    const spaced = String(raw || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim();
    if (!spaced) return 'Contract Action';
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeNameList(list) {
    if (!Array.isArray(list)) return null;
    return new Set(
        list
            .map((name) => String(name || '').trim().toLowerCase())
            .filter(Boolean)
    );
}

function getArgPlaceholder(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'address') return '0x...';
    if (normalized === 'bool') return 'true / false';
    if (normalized.startsWith('uint') || normalized.startsWith('int')) return 'e.g. 1';
    if (normalized.startsWith('bytes')) return '0x...';
    return '';
}

function getArgLabel(name, type, index) {
    const key = String(name || '').toLowerCase();
    if (key === 'tokenid' || key === 'id') return 'Token ID';
    if (key === 'to' && String(type || '').toLowerCase() === 'address') return 'Recipient Address';
    if (key === 'from' && String(type || '').toLowerCase() === 'address') return 'From Address';
    if (name) return toTitleCaseLabel(name);
    return `Arg ${index + 1}`;
}

function isSupportedAutoInputType(type) {
    const normalized = String(type || '').toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('[') || normalized.startsWith('tuple')) return false;
    if (normalized === 'address' || normalized === 'bool' || normalized === 'string') return true;
    if (normalized.startsWith('uint') || normalized.startsWith('int')) return true;
    if (normalized.startsWith('bytes')) return true;
    return false;
}

function countFunctionNames(abi) {
    const counts = new Map();
    for (const item of abi || []) {
        if (item?.type !== 'function' || !item?.name) continue;
        counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }
    return counts;
}

function isBlockedAutoFunctionName(lowerName) {
    if (BLOCKED_AUTO_FUNCTION_NAMES.has(lowerName)) return true;
    if (lowerName.includes('mint')) return true;
    if (lowerName.includes('approve')) return true;
    return BLOCKED_AUTO_FUNCTION_PREFIXES.some((prefix) => lowerName.startsWith(prefix));
}

function shouldIncludeAutoFunction(item, options) {
    if (item?.type !== 'function') return false;
    if (!item?.name) return false;

    const mutability = String(item?.stateMutability || '');
    if (mutability !== 'nonpayable' && mutability !== 'payable') return false;
    if (mutability === 'payable' && !options.includePayable) return false;

    const lowerName = String(item.name).toLowerCase();
    if (isBlockedAutoFunctionName(lowerName)) return false;

    if ((item.inputs || []).length > options.maxInputs) return false;
    if ((item.inputs || []).some((input) => !isSupportedAutoInputType(input?.type))) return false;

    if (options.overloadedNames.has(item.name)) return false;
    if (options.existingContractCallNames.has(lowerName)) return false;
    if (options.allowNames && !options.allowNames.has(lowerName)) return false;
    if (options.denyNames && options.denyNames.has(lowerName)) return false;

    return true;
}

function discoverContractCallActions(collection, abi, configuredActions = []) {
    if (collection?.autoLoadContractFunctions === false) {
        return [];
    }

    const allowNames = normalizeNameList(collection?.autoLoadContractFunctionNames);
    const denyNames = normalizeNameList(collection?.autoExcludeContractFunctionNames);
    const maxInputs = Number.isFinite(Number(collection?.autoLoadContractFunctionMaxInputs))
        ? Math.max(0, Number(collection.autoLoadContractFunctionMaxInputs))
        : 4;
    const includePayable = collection?.autoLoadPayableContractFunctions === true;

    const overloadedNames = new Set(
        [...countFunctionNames(abi).entries()]
            .filter(([, count]) => count > 1)
            .map(([name]) => name)
    );
    const existingContractCallNames = new Set(
        configuredActions
            .filter((action) => action.type === 'CONTRACT_CALL' && action.functionName)
            .map((action) => String(action.functionName).toLowerCase())
    );

    const discovered = [];
    for (const item of abi || []) {
        if (!shouldIncludeAutoFunction(item, {
            overloadedNames,
            existingContractCallNames,
            allowNames,
            denyNames,
            maxInputs,
            includePayable
        })) {
            continue;
        }

        const args = (item.inputs || []).map((input, index) => ({
            key: String(input?.name || `arg${index + 1}`),
            label: getArgLabel(input?.name, input?.type, index),
            type: String(input?.type || 'string'),
            placeholder: getArgPlaceholder(input?.type),
            required: true
        }));

        const normalized = normalizeAction({
            id: `auto-${item.name}`,
            type: 'CONTRACT_CALL',
            label: toTitleCaseLabel(item.name),
            description: `Auto-loaded from ABI: ${item.name}`,
            functionName: item.name,
            successMessage: `${toTitleCaseLabel(item.name)} completed`,
            value: item?.stateMutability === 'payable'
                ? {
                    inputKey: DEFAULT_NATIVE_VALUE_INPUT_KEY,
                    unit: 'eth',
                    label: 'Native Value (ETH)',
                    placeholder: 'e.g. 0.001',
                    required: false
                }
                : undefined,
            args
        }, discovered.length);

        if (!normalized) continue;
        discovered.push(normalized);
        existingContractCallNames.add(String(item.name).toLowerCase());
    }

    return discovered;
}

function normalizeAction(action, index) {
    if (!action || typeof action !== 'object') return null;

    const type = String(action.type || '').toUpperCase();
    if (!ACTION_TYPES.has(type)) return null;

    const id = toActionId(action.id || action.label || type, index);
    const args = Array.isArray(action.args) && action.args.length
        ? action.args.map((arg, argIndex) => normalizeArg(arg, argIndex))
        : getDefaultArgs(type);

    return {
        id,
        type,
        label: String(action.label || id),
        description: action.description ? String(action.description) : '',
        functionName: action.functionName ? String(action.functionName) : '',
        successMessage: action.successMessage ? String(action.successMessage) : '',
        buttonLabel: action.buttonLabel ? String(action.buttonLabel) : '',
        deadAddress: action.deadAddress ? String(action.deadAddress) : DEFAULT_DEAD_ADDRESS,
        value: normalizeValueConfig(action.value),
        approvalRequired: normalizeApprovalConfig(action.approvalRequired),
        args
    };
}

export function getCollectionActions(collection) {
    const configuredActions = Array.isArray(collection?.contractActions)
        ? collection.contractActions
            .map((action, index) => normalizeAction(action, index))
            .filter(Boolean)
        : [];

    let config;
    try {
        config = getContractConfig(collection);
    } catch {
        return configuredActions;
    }

    const discoveredActions = discoverContractCallActions(collection, config.abi, configuredActions);
    const combinedActions = [...configuredActions, ...discoveredActions];

    if (collection?.includeDefaultContractActions === false) {
        return combinedActions;
    }

    const hasTransferSupport = !!resolveTransferFunction(config.abi);
    if (!hasTransferSupport) {
        return combinedActions;
    }

    const configuredIds = new Set(combinedActions.map((action) => action.id));
    const configuredTypes = new Set(combinedActions.map((action) => action.type));
    const defaultActions = getDefaultCollectionActions()
        .map((action, index) => normalizeAction(action, index))
        .filter((action) => action && !configuredIds.has(action.id) && !configuredTypes.has(action.type));

    return [...combinedActions, ...defaultActions];
}

export function getActionInputDefs(action) {
    if (!action?.args?.length) return [];
    return action.args.filter((arg) => !arg.hidden && arg.value === undefined);
}

export function getActionConfigInputDefs(action) {
    const defs = [];

    if (action?.value?.mode === 'input' && action.value.inputKey) {
        defs.push({
            key: action.value.inputKey,
            label: action.value.label || (action.value.unit === 'wei' ? 'Native Value (wei)' : 'Native Value (ETH)'),
            type: action.value.unit === 'wei' ? 'uint256' : 'eth',
            placeholder: action.value.placeholder || (action.value.unit === 'wei' ? 'e.g. 1000000000000000' : 'e.g. 0.001'),
            required: action.value.required !== false
        });
    }

    if (action?.approvalRequired?.amountInputKey) {
        defs.push({
            key: action.approvalRequired.amountInputKey,
            label: action.approvalRequired.amountLabel || 'Approval Amount',
            type: 'decimal',
            placeholder: action.approvalRequired.amountPlaceholder || 'e.g. 10',
            required: action.approvalRequired.required !== false
        });
    }

    const seen = new Set();
    return defs.filter((def) => {
        const normalized = String(def?.key || '').toLowerCase();
        if (!normalized) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function isNumericType(type) {
    const value = String(type || '').toLowerCase();
    return value.startsWith('uint') || value.startsWith('int');
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    throw new Error(`Invalid boolean value: ${value}`);
}

function coerceArgValue(arg, inputValues) {
    const rawValue = arg.value !== undefined ? arg.value : inputValues[arg.key];
    const hasValue = !(rawValue === undefined || rawValue === null || String(rawValue).trim() === '');

    if (!hasValue) {
        if (arg.required !== false) {
            throw new Error(`Missing required input: ${arg.label}`);
        }
        return undefined;
    }

    if (arg.type === 'address') {
        const address = String(rawValue).trim();
        if (!isValidAddress(address)) {
            throw new Error(`Invalid address for ${arg.label}`);
        }
        return address;
    }

    if (arg.type === 'bool') {
        return parseBoolean(rawValue);
    }

    if (isNumericType(arg.type)) {
        return BigInt(String(rawValue).trim());
    }

    return rawValue;
}

function buildActionArgs(action, inputValues) {
    const args = [];
    for (const arg of action.args || []) {
        const value = coerceArgValue(arg, inputValues);
        if (value !== undefined) {
            args.push(value);
        }
    }
    return args;
}

function parseNonNegativeBigInt(rawValue, label) {
    const value = BigInt(String(rawValue).trim());
    if (value < 0n) {
        throw new Error(`${label} must be >= 0`);
    }
    return value;
}

function resolveActionTxValue(action, inputValues) {
    if (!action?.value) return 0n;

    const valueConfig = action.value;
    const isInput = valueConfig.mode === 'input';
    const rawValue = isInput ? inputValues[valueConfig.inputKey] : valueConfig.value;
    const hasValue = !(rawValue === undefined || rawValue === null || String(rawValue).trim() === '');

    if (!hasValue) {
        if (valueConfig.required !== false) {
            throw new Error(`Missing required input: ${valueConfig.label || 'Native Value'}`);
        }
        return 0n;
    }

    try {
        if (valueConfig.unit === 'eth') {
            const parsed = parseEther(String(rawValue).trim());
            if (parsed < 0n) throw new Error('Native value must be >= 0');
            return parsed;
        }
        return parseNonNegativeBigInt(rawValue, 'Native value');
    } catch {
        throw new Error(`Invalid native value for ${valueConfig.label || 'transaction value'}`);
    }
}

function resolveApprovalAmount(action, inputValues) {
    const approval = action?.approvalRequired;
    if (!approval) return 0n;

    if (approval.amountWei && String(approval.amountWei).trim() !== '') {
        return parseNonNegativeBigInt(approval.amountWei, 'Approval amount');
    }

    const rawValue = approval.amountInputKey
        ? inputValues[approval.amountInputKey]
        : approval.amount;
    const hasValue = !(rawValue === undefined || rawValue === null || String(rawValue).trim() === '');

    if (!hasValue) {
        if (approval.required !== false) {
            throw new Error(`Missing required input: ${approval.amountLabel || 'Approval Amount'}`);
        }
        return 0n;
    }

    try {
        const parsed = parseUnits(String(rawValue).trim(), approval.decimals || 18);
        if (parsed < 0n) throw new Error('Approval amount must be >= 0');
        return parsed;
    } catch {
        throw new Error(`Invalid approval amount for ${approval.amountLabel || 'Approval Amount'}`);
    }
}

function hasFunction(abi, functionName, inputsLength) {
    return abi.some(
        (item) =>
            item?.type === 'function' &&
            item?.name === functionName &&
            item?.inputs?.length === inputsLength
    );
}

function resolveTransferFunction(abi) {
    if (hasFunction(abi, 'safeTransferFrom', 3)) {
        return 'safeTransferFrom';
    }

    if (hasFunction(abi, 'transferFrom', 3)) {
        return 'transferFrom';
    }

    return null;
}

const ERC20_ALLOWANCE_ABI = [
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ name: '', type: 'bool' }]
    }
];

async function ensureApprovalIfNeeded(action, inputValues, wagmiConfig, userAddress, chainId, spenderDefault) {
    const approval = action?.approvalRequired;
    if (!approval) return null;

    const tokenAddress = String(approval.tokenAddress || '').trim();
    if (!isValidAddress(tokenAddress)) {
        throw new Error('Invalid approval token address');
    }

    const spender = String(approval.spender || spenderDefault || '').trim();
    if (!isValidAddress(spender)) {
        throw new Error('Invalid approval spender address');
    }

    const requiredAmount = resolveApprovalAmount(action, inputValues);
    if (requiredAmount <= 0n) return null;

    const allowance = await readContract(wagmiConfig, {
        address: tokenAddress,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'allowance',
        args: [userAddress, spender],
        chainId
    });

    if (allowance >= requiredAmount) return null;

    if (approval.resetToZeroFirst === true && allowance > 0n) {
        const resetHash = await writeContract(wagmiConfig, {
            address: tokenAddress,
            abi: ERC20_ALLOWANCE_ABI,
            functionName: 'approve',
            args: [spender, 0n],
            chainId,
            dataSuffix: DATA_SUFFIX
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: resetHash, confirmations: 1 });
    }

    const approveHash = await writeContract(wagmiConfig, {
        address: tokenAddress,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [spender, requiredAmount],
        chainId,
        dataSuffix: DATA_SUFFIX
    });

    await waitForTransactionReceipt(wagmiConfig, {
        hash: approveHash,
        confirmations: 1
    });

    return approveHash;
}

export async function executeContractAction(collection, action, inputValues, walletAddress) {
    if (!walletAddress || !isValidAddress(walletAddress)) {
        throw new Error('Wallet is not connected');
    }

    const config = getContractConfig(collection);
    const wagmiConfig = wagmiAdapter.wagmiConfig;
    const safeInputValues = inputValues || {};
    const txValue = resolveActionTxValue(action, safeInputValues);
    let hash;

    if (action.type === 'CONTRACT_CALL') {
        if (!action.functionName) {
            throw new Error(`Action "${action.label}" is missing functionName`);
        }

        const args = buildActionArgs(action, safeInputValues);
        const abiMatch = config.abi.some(
            (item) => item?.type === 'function' && item?.name === action.functionName
        );

        if (!abiMatch) {
            throw new Error(`Function ${action.functionName} not found in ${collection.abiName} ABI`);
        }

        await ensureApprovalIfNeeded(
            action,
            safeInputValues,
            wagmiConfig,
            walletAddress,
            config.chainId,
            config.address
        );

        const txRequest = {
            address: config.address,
            abi: config.abi,
            functionName: action.functionName,
            args,
            chainId: config.chainId,
            dataSuffix: DATA_SUFFIX
        };

        if (txValue > 0n) {
            txRequest.value = txValue;
        }

        hash = await writeContract(wagmiConfig, txRequest);
    } else {
        const transferFn = resolveTransferFunction(config.abi);
        if (!transferFn) {
            throw new Error('No transfer function available in contract ABI');
        }

        const tokenIdArg = action.args?.find((arg) => arg.key === 'tokenId') || {
            key: 'tokenId',
            label: 'Token ID',
            type: 'uint256',
            required: true
        };
        const tokenId = coerceArgValue(tokenIdArg, inputValues || {});
        const toAddress = action.type === 'SEND_TO_DEAD'
            ? action.deadAddress
            : coerceArgValue(
                action.args?.find((arg) => arg.key === 'to') || {
                    key: 'to',
                    label: 'Recipient Address',
                    type: 'address',
                    required: true
                },
                safeInputValues
            );

        if (!isValidAddress(toAddress)) {
            throw new Error('Invalid recipient address');
        }

        hash = await writeContract(wagmiConfig, {
            address: config.address,
            abi: config.abi,
            functionName: transferFn,
            args: [walletAddress, toAddress, tokenId],
            chainId: config.chainId,
            dataSuffix: DATA_SUFFIX
        });
    }

    await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 1
    });

    return hash;
}
