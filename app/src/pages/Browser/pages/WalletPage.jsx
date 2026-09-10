/**
 * WalletPage — mock crypto wallet dashboard.
 */
import { useState } from 'preact/hooks';
import Icon from '../../../Components/Icon';

const MOCK_ASSETS = [
  { symbol: 'BAT', name: 'Basic Attention Token', balance: '1,250.00', usd: '$312.50', change: '+2.4%', color: '#fb542b' },
  { symbol: 'ETH', name: 'Ethereum', balance: '0.45', usd: '$1,125.00', change: '-1.2%', color: '#627eea' },
  { symbol: 'SOL', name: 'Solana', balance: '12.5', usd: '$1,812.50', change: '+5.7%', color: '#9945ff' },
];

const MOCK_ACTIVITY = [
  { type: 'receive', symbol: 'BAT', amount: '+50.00', from: 'Rewards', time: '2h ago' },
  { type: 'send', symbol: 'ETH', amount: '-0.05', to: '0x1a2b...3c4d', time: '1d ago' },
  { type: 'swap', symbol: 'SOL', amount: '+2.5', detail: 'Swapped from USDC', time: '3d ago' },
];

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState('assets');

  const totalUsd = '$3,250.00';

  return (
    <div className="flex h-full flex-col bg-[#0f0f17]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Wallet</h2>
          <div className="flex gap-2">
            <button className="rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/30">
              <Icon name="ArrowUpRight" className="mr-1 inline h-3 w-3" /> Send
            </button>
            <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
              <Icon name="ArrowDownLeft" className="mr-1 inline h-3 w-3" /> Receive
            </button>
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold text-white">{totalUsd}</p>
        <p className="text-[11px] text-white/30">Total balance</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] px-4">
        {['assets', 'activity', 'nfts'].map(tab => (
          <button
            key={tab}
            className={`border-b-2 px-3 py-2 text-xs font-medium capitalize transition-colors ${
              activeTab === tab ? 'border-orange-500 text-white' : 'border-transparent text-white/40 hover:text-white/60'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'assets' && (
          <div className="flex flex-col gap-2">
            {MOCK_ASSETS.map(asset => (
              <div key={asset.symbol} className="flex items-center gap-3 rounded-lg border border-white/[0.06] p-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: `${asset.color}33` }}
                >
                  {asset.symbol.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white">{asset.name}</p>
                  <p className="text-[10px] text-white/40">{asset.balance} {asset.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/80">{asset.usd}</p>
                  <p className={`text-[10px] ${asset.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>{asset.change}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="flex flex-col gap-2">
            {MOCK_ACTIVITY.map((item, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] p-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  item.type === 'receive' ? 'bg-green-500/10 text-green-400' :
                  item.type === 'send' ? 'bg-red-500/10 text-red-400' :
                  'bg-purple-500/10 text-purple-400'
                }`}>
                  <Icon name={item.type === 'receive' ? 'ArrowDownLeft' : item.type === 'send' ? 'ArrowUpRight' : 'Repeat'} className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/80">
                    {item.type === 'receive' ? `Received ${item.symbol}` : item.type === 'send' ? `Sent ${item.symbol}` : `Swapped ${item.symbol}`}
                  </p>
                  <p className="text-[10px] text-white/30">{item.from || item.to || item.detail}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${item.amount.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>{item.amount}</p>
                  <p className="text-[10px] text-white/25">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'nfts' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
            <Icon name="Image" className="h-8 w-8" />
            <p className="text-sm">No NFTs found</p>
            <p className="text-[11px] text-white/20">NFTs in your wallet will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
