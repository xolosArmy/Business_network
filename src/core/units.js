// src/core/units.js
// Conversión y formateo XEC ↔ sats

export const SATS_PER_XEC = 100;

export const toSats = (xec) => {
  const n = Number(xec);
  if (!isFinite(n)) return 0;
  return Math.round(n * SATS_PER_XEC);
};

export const fromSats = (sats) => {
  const n = Number(sats);
  if (!isFinite(n)) return 0;
  return n / SATS_PER_XEC;
};

export const formatXec = (sats, locale) =>
  fromSats(sats).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const truncateAddr = (addr, tail = 8) => {
  if (!addr) return '';
  const [pre, body] = String(addr).split(':');
  if (!body) return addr;
  return `${pre}:${body.slice(0, 8)}…${body.slice(-tail)}`;
};
