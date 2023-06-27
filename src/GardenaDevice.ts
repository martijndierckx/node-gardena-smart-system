import Moment from 'moment';

export type GardenaRawDevicesJson = {
  data: {
    id: string;
    type: string;
    relationships: {
      devices: {
        data: {
          id: string;
          type: string;
        }[];
      };
    };
    attributes: { name: string };
  };
  included: any[];
};

export type GardenaRawDeviceAttributeJson = {
  value: any;
  ts?: Moment.Moment;
};

export enum GardenaDeviceBatteryState {
  Ok = 'OK',
  Low = 'LOW',
  ReplaceNow = 'REPLACE_NOW',
  OutOfOperation = 'OUT_OF_OPERATION',
  Charging = 'CHARGING',
  NoBattery = 'NO_BATTERY',
  Unknown = 'UNKNOWN'
}

export enum GardenaDeviceRfLinkState {
  Online = 'ONLINE',
  Offline = 'OFFLINE',
  Unknown = 'UNKNOWN'
}

export class GardenaDevice {
  public readonly id: string;
  public readonly name: string;
  public readonly batteryLevel: number;
  public readonly batteryLevelTs: Moment.Moment;
  public readonly batteryState: GardenaDeviceBatteryState;
  public readonly batteryStateTs: Moment.Moment;
  public readonly rfLinkLevel: number;
  public readonly rfLinkLevelTs: Moment.Moment;
  public readonly rfLinkState: GardenaDeviceRfLinkState;
  public readonly serial: string;
  public readonly modelType: string;

  protected constructor(id: string, attributes: GardenaRawDeviceAttributeJson[]) {
    this.id = id;
    this.name = attributes['name'].value;
    this.batteryLevel = attributes['batteryLevel'].value;
    this.batteryLevelTs = attributes['batteryLevel'].ts;
    this.batteryState = attributes['batteryState'].value;
    this.batteryStateTs = attributes['batteryState'].ts;
    this.rfLinkLevel = attributes['rfLinkLevel'].value;
    this.rfLinkLevelTs = attributes['rfLinkLevel'].ts;
    this.rfLinkState = attributes['rfLinkState'].value;
    this.serial = attributes['serial'].value;
    this.modelType = attributes['modelType'].value;
  }
}
