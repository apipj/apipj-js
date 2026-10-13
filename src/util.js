/**
 * Espera `ms` milissegundos; rejeita com o motivo do `signal` se ele for abortado antes.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function dormir(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', aoAbortar);
      resolve();
    }, Math.max(0, ms));
    function aoAbortar() {
      clearTimeout(t);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', aoAbortar, { once: true });
  });
}
