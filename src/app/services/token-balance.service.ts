import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChronikService } from './chronik.service';
import { RMZ_TOKEN_ID } from './chronik.constants';

/**
 * Placeholder de saldo de token RMZ:
 * - Escucha el stream de tokens del ChronikService si existe
 * - Filtra por el tokenId de RMZ y expone balanceRmz$
 */
@Injectable({ providedIn: 'root' })
export class TokenBalanceService {
  private _balanceRmz = new BehaviorSubject<number>(0);
  public readonly balanceRmz$ = this._balanceRmz.asObservable();

  // Ajusta con tu tokenId real
  private readonly rmzTokenId = RMZ_TOKEN_ID;

  constructor(private chronik: ChronikService) {
    const tokens$ = (this.chronik as any).tokens$ || (this.chronik as any).balances$;
    if (tokens$?.subscribe) {
      tokens$.subscribe((list: any[] = []) => {
        const rmz = list.find((t) => (t?.tokenId || t?.id) === this.rmzTokenId);
        const amount = Number(rmz?.amount || rmz?.balance || 0);
        this._balanceRmz.next(amount);
      });
    }
  }
}
