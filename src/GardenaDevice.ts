import EventEmitter from 'events';
import Moment from 'moment';
import { GardenaConnection } from './GardenaConnection';
import { GardenaDeviceBatteryState, GardenaDeviceRfLinkState } from './Enums';

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

export class GardenaDevice extends EventEmitter {
  protected connection: GardenaConnection;
  public readonly id: string;
  public serial: string;
  public modelType: string;
  public name: string;
  public batteryLevel: number;
  public batteryLevelTs: Moment.Moment;
  public batteryState: GardenaDeviceBatteryState;
  public batteryStateTs: Moment.Moment;
  public rfLinkLevel: number;
  public rfLinkLevelTs: Moment.Moment;
  public rfLinkState: GardenaDeviceRfLinkState;

  protected constructor(connection: GardenaConnection, id: string) {
    super();

    this.connection = connection;
    this.id = id;
  }

  public processAttributes(attributes: GardenaRawDeviceAttributeJson[]): string[] {
    const updatedFields: string[] = [];

    for (const field in attributes) {
      if (field in this) {
        // Update value
        this[field] = attributes[field].value;

        // Update timestamp
        if (attributes[field].ts) {
          this[`${field}Ts`] = attributes[field].ts;
        }

        // Add field to updates list
        updatedFields.push(field);
      }
    }

    return updatedFields;
  }

  public onStartRealtimeUpdates(func: () => void): this {
    return this.on('startWSUpdates', func);
  }

  public onStopRealtimeUpdates(func: () => void): this {
    return this.on('stopWSUpdates', func);
  }

  public onUpdate(func: (updatedValues: string[]) => void): this {
    return this.on('wsUpdate', func);
  }
}
