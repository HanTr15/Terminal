// Cache state sesi di memori proses.
//
// Tujuannya mengurangi query ke Neon: selama instance serverless masih hangat,
// command berturut-turut dilayani dari memori. Ini hanya percepatan — sumber
// kebenaran tetap database, jadi kalau instance mati state tetap aman.
//
// Dipakai bersama oleh /api/terminal dan /api/reset. Reset WAJIB memanggil
// cacheDelete, kalau tidak state lama akan muncul lagi dari cache.

const CACHE = new Map();
const TTL = 5 * 60 * 1000;
const MAX = 200;

export function cacheGet(id) {
  const hit = CACHE.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL) {
    CACHE.delete(id);
    return null;
  }
  return hit.state;
}

export function cacheSet(id, state) {
  if (CACHE.size >= MAX && !CACHE.has(id)) {
    CACHE.delete(CACHE.keys().next().value); // buang entri terlama
  }
  CACHE.set(id, { state, at: Date.now() });
}

export function cacheDelete(id) {
  CACHE.delete(id);
}
