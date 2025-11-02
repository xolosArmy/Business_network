// src/app/utils/key-derivation.adapter.ts

// Tipo mínimo que consumen los servicios
export type KDLike = {
  generateMnemonic: () => Promise<string>;
  deriveKeysFromMnemonic: (mnemonic: string) => Promise<any>;
};

// Singleton que se auto-inicializa con la mejor opción disponible (WASM/JS)
let sharedPromise: Promise<KDLike> | null = null;

async function init(): Promise<KDLike> {
  // Carga el paquete principal (evitar rutas no exportadas como /web o /browser)
  const mod: any = await import('minimal-xec-wallet');

  // La lib puede exponer las funciones en default o a nivel raíz
  const api =
    mod?.default ??
    mod?.MinimalXecWallet ??
    mod;

  if (!api?.generateMnemonic || !api?.deriveKeysFromMnemonic) {
    throw new Error('minimal-xec-wallet no expone generateMnemonic/deriveKeysFromMnemonic');
  }

  // Normalizamos la API
  return {
    generateMnemonic: async () => api.generateMnemonic(),
    deriveKeysFromMnemonic: async (mnemonic: string) => api.deriveKeysFromMnemonic(mnemonic),
  };
}

export function getSharedInstance(): Promise<KDLike> {
  if (!sharedPromise) sharedPromise = init();
  return sharedPromise;
}
