declare module 'ecashaddrjs' {
  export type Decoded = {
    hash: Uint8Array;
    type: string;
  };

  export function decode(addr: string): Decoded;
}
