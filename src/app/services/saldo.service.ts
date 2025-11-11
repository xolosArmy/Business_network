import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { ChronikService } from './chronik.service';

/**
 * Servicio muy simple para saldo de XEC:
 * - Escucha UTXOs o balance$ que ya emita ChronikService (ajusta nombres si difieren)
 * - Expone balanceXec$ como BehaviorSubject<number>
 */
@Injectable({ providedIn: 'root' })
export class SaldoService {
  private _balanceXec = new BehaviorSubject<number>(0);
  public readonly balanceXec$ = this._balanceXec.asObservable();

  constructor(private chronik: ChronikService) {
    // Ajusta a la fuente real que tengas disponible:
    // Opción 1: si chronik ya expone balance en XEC:
    if ((this.chronik as any).balanceXec$) {
      (this.chronik as any).balanceXec$.subscribe((v: number) => {
        this._balanceXec.next(Number(v || 0));
      });
      return;
    }

    // Opción 2: calcular por UTXOs (asumiendo utxos$ emite [{satoshis:number}]):
    const utxos$ = (this.chronik as any).utxos$;
    if (utxos$?.subscribe) {
      utxos$
        .pipe(
          map((list: any[] = []) => {
            const sats = list.reduce((acc, u) => acc + (u?.satoshis || 0), 0);
            // 1 XEC = 100 satoshis (XEC), ajusta si usas otra unidad.
            return sats / 100;
          })
        )
        .subscribe((v: number) => this._balanceXec.next(v));
    }
  }
}
