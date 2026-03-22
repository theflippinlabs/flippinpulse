import { supabase } from './supabase';
import type { Wallet, WalletNFTStatus, AccessStatus, NFTAccessRule } from '../types';

// ─── Wallet Management ────────────────────────────────────────────────────────

export async function linkWallet(
  userId: string,
  address: string,
  chainId: number = 1
): Promise<{ data: Wallet | null; error: Error | null }> {
  const chainNames: Record<number, string> = {
    1: 'Ethereum Mainnet',
    137: 'Polygon',
    42161: 'Arbitrum One',
    8453: 'Base',
    10: 'Optimism',
  };

  const { data: existing } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('address', address.toLowerCase())
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('wallets')
      .update({ chain_id: chainId, chain_name: chainNames[chainId] || 'Unknown' })
      .eq('id', existing.id)
      .select()
      .single();
    return { data, error: error ? new Error(error.message) : null };
  }

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      address: address.toLowerCase(),
      chain_id: chainId,
      chain_name: chainNames[chainId] || 'Unknown',
      is_primary: true,
    })
    .select()
    .single();

  return { data, error: error ? new Error(error.message) : null };
}

export async function getWallets(userId: string): Promise<{ data: Wallet[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('linked_at', { ascending: false });
  return { data, error: error ? new Error(error.message) : null };
}

export async function unlinkWallet(walletId: string, userId: string) {
  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', walletId)
    .eq('user_id', userId);
  return { error };
}

// ─── NFT Verification ─────────────────────────────────────────────────────────

export async function getNFTAccessRules(): Promise<NFTAccessRule[]> {
  const { data } = await supabase
    .from('nft_access_rules')
    .select('*')
    .eq('is_active', true);
  return data || [];
}

export async function verifyNFTOwnership(
  walletAddress: string,
  chainId: number = 1
): Promise<WalletNFTStatus[]> {
  // Production: call on-chain RPC or NFT indexer API (e.g. Alchemy, Moralis)
  // For now, we return mock results that can be replaced with real provider calls

  const rules = await getNFTAccessRules();

  // Mock verification — replace with real provider calls
  const results: WalletNFTStatus[] = rules.map((rule) => ({
    id: `mock-${rule.id}`,
    wallet_id: walletAddress,
    rule_id: rule.id,
    is_eligible: false, // real logic: check on-chain
    token_ids: [],
    last_verified_at: new Date().toISOString(),
    rule,
  }));

  return results;
}

export async function getWalletNFTStatus(walletId: string): Promise<WalletNFTStatus[]> {
  const { data } = await supabase
    .from('wallet_nft_status')
    .select('*, nft_access_rules(*)')
    .eq('wallet_id', walletId);
  return data || [];
}

// ─── Access Tier Resolution ────────────────────────────────────────────────────

export async function resolveAccessStatus(userId: string): Promise<AccessStatus> {
  const { data: wallets } = await supabase
    .from('wallets')
    .select('id, address')
    .eq('user_id', userId);

  const hasWallet = (wallets?.length ?? 0) > 0;
  let nftVerified = false;

  if (hasWallet && wallets) {
    for (const wallet of wallets) {
      const { data: statuses } = await supabase
        .from('wallet_nft_status')
        .select('is_eligible')
        .eq('wallet_id', wallet.id)
        .eq('is_eligible', true);

      if (statuses && statuses.length > 0) {
        nftVerified = true;
        break;
      }
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier_id, subscription_tiers(name, monthly_generation_limit)')
    .eq('id', userId)
    .single();

  const tier = nftVerified ? 'nft_verified' : 'free';
  const limit = 5; // default free tier

  return {
    tier,
    walletConnected: hasWallet,
    nftVerified,
    unlockedFeatures: nftVerified
      ? ['hd_export', 'unlimited_generations', 'priority_queue', 'all_styles', 'brand_overlay']
      : ['preview_generation'],
    generationsRemaining: nftVerified ? 999 : limit,
    generationsTotal: nftVerified ? 999 : limit,
  };
}

// ─── Wallet Connection (Browser) ──────────────────────────────────────────────

export interface WalletConnectionResult {
  address: string;
  chainId: number;
  chainName: string;
}

export async function connectBrowserWallet(): Promise<WalletConnectionResult> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Ethereum wallet detected. Install MetaMask or another Web3 wallet.');
  }

  const accounts: string[] = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });

  if (!accounts.length) throw new Error('No accounts returned from wallet.');

  const chainIdHex: string = await window.ethereum.request({ method: 'eth_chainId' });
  const chainId = parseInt(chainIdHex, 16);

  const chainNames: Record<number, string> = {
    1: 'Ethereum Mainnet',
    137: 'Polygon',
    42161: 'Arbitrum One',
    8453: 'Base',
    10: 'Optimism',
  };

  return {
    address: accounts[0],
    chainId,
    chainName: chainNames[chainId] || `Chain ${chainId}`,
  };
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
