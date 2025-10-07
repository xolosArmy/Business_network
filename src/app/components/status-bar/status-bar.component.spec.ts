import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusBarComponent } from './status-bar.component';
import { BleService } from '../../services/ble.service';

class MockBleService {
  connectedDevice: {
    name?: string | null;
    localName?: string | null;
  } | null = null;
}

describe('StatusBarComponent', () => {
  let fixture: ComponentFixture<StatusBarComponent>;
  let component: StatusBarComponent;
  let bleService: MockBleService;
  let online = true;

  beforeAll(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  });

  beforeEach(async () => {
    online = true;

    await TestBed.configureTestingModule({
      declarations: [StatusBarComponent],
      providers: [{ provide: BleService, useClass: MockBleService }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    bleService = TestBed.inject(BleService) as unknown as MockBleService;
    fixture = TestBed.createComponent(StatusBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should react to online/offline events', () => {
    online = false;
    window.dispatchEvent(new Event('offline'));

    expect(component.isOnline).toBe(false);

    online = true;
    window.dispatchEvent(new Event('online'));

    expect(component.isOnline).toBe(true);
  });

  it('should expose BLE connection state and device information', () => {
    bleService.connectedDevice = {
      name: 'Ledger Nano',
    };

    expect(component.bleConnected).toBe(true);
    expect(component.bleIcon).toBe('bluetooth');
    expect(component.bleDevice).toBe('Ledger Nano');
  });

  it('should return null when BLE device has no name information', () => {
    bleService.connectedDevice = {
      name: ' ',
      localName: '',
    };

    expect(component.bleDevice).toBeNull();
  });
});
