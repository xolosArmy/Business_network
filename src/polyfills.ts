import { Buffer } from 'buffer';
import process from 'process';

(window as any).global = window;
(window as any).Buffer = Buffer;
(window as any).process = process;

/**
 * Polyfills for the Angular web build.
 * Modern browsers already provide the necessary Web APIs,
 * so this file intentionally exports nothing.
 */
export {};
