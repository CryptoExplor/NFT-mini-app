import { state } from '../state.js';
import { shortenAddress } from './dom.js';

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function formatHandle(username) {
  if (!username) return '';
  return username.startsWith('@') ? username : `@${username}`;
}

export function getMiniAppProfile() {
  const user = state?.farcaster?.context?.user;
  if (!user || typeof user !== 'object') return null;

  const username = firstText(user.username, user.userName, user.handle);
  const displayName = firstText(user.displayName, user.display_name, user.name);
  const avatarUrl = firstText(
    user.pfpUrl,
    user.pfp_url,
    user.avatarUrl,
    user.avatar_url,
    user.profileImageUrl,
    user.profile_image_url,
    user.pfp?.url,
    user.avatar?.url
  );
  const fid = Number(user.fid);

  return {
    username: username || null,
    displayName: displayName || null,
    avatarUrl: avatarUrl || null,
    fid: Number.isFinite(fid) ? fid : null
  };
}

export function getMiniAppProfileLabel(profile = getMiniAppProfile()) {
  if (!profile) return '';
  if (profile.username) {
    if (state.platform?.host === 'base') return profile.username;
    return formatHandle(profile.username);
  }
  if (profile.displayName) return profile.displayName;
  return '';
}

export function getWalletIdentityLabel(account = state.wallet) {
  const profileLabel = getMiniAppProfileLabel();

  if (account?.isConnected) {
    return profileLabel || shortenAddress(account.address);
  }

  if (profileLabel) return `${profileLabel} - Connect`;
  return 'Connect Wallet';
}

export function applyMiniAppAvatar(imgEl, fallbackEl = null) {
  if (!imgEl) return;

  const profile = getMiniAppProfile();
  const avatarUrl = profile?.avatarUrl || '';

  if (avatarUrl) {
    imgEl.src = avatarUrl;
    imgEl.alt = `${getMiniAppProfileLabel(profile) || 'Mini App user'} avatar`;
    imgEl.classList.remove('hidden');

    if (fallbackEl) fallbackEl.classList.add('hidden');

    imgEl.onerror = () => {
      imgEl.classList.add('hidden');
      if (fallbackEl) fallbackEl.classList.remove('hidden');
    };
    return;
  }

  imgEl.removeAttribute('src');
  imgEl.classList.add('hidden');
  if (fallbackEl) fallbackEl.classList.remove('hidden');
}
