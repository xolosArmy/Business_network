import type { Event } from 'ws';

declare module 'chronik-client' {
  interface WsConfig {
    onClose?: (e: Event) => void;
  }
}
