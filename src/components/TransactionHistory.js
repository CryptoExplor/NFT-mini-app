
import { getStoredTransactions } from '../lib/mintHelpers.js';
import { getExplorerUrl } from '../utils/chain.js';

export function renderTransactionHistory() {
  const transactions = getStoredTransactions();

  if (transactions.length === 0) return '';

  return `
    <div class="glass-card p-6 rounded-xl mt-8">
      <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
        <span>📜</span> Recent Transactions
      </h3>
      <div class="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
        ${transactions.map(tx => `
          <div class="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
            <div>
              <div class="font-medium text-sm">${tx.collectionName}</div>
              <div class="text-[10px] opacity-50">${new Date(tx.timestamp).toLocaleString()}</div>
            </div>
            <div class="flex items-center gap-3">
               <a href="${getExplorerUrl(tx.chainId)}/tx/${tx.hash}" 
                  target="_blank"
                  class="text-indigo-400 hover:text-indigo-300 text-xs font-medium bg-indigo-500/10 px-2 py-1 rounded">
                 View →
               </a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
