import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import './app/utils/ecash-wallet-polyfills';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => {
    console.error('BOOTSTRAP ERROR →', err);
    // Angular attaches the injection path when it can; helpful for NullInjectorError.
    const tokenPath = (err as any)?.ngTempTokenPath;
    if (tokenPath) {
      console.error('TokenPath:', tokenPath);
    }
  });
