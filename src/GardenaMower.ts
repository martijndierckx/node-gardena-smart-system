import Moment from 'moment';
import crypto from 'crypto';
import { API_BASE } from './config';
import { GardenaDevice, GardenaRawDeviceAttributeJson } from './GardenaDevice';
import { GardenaConnection } from './GardenaConnection';
import { GardenaApiError } from './GardenaConnection';
import { GardenaMowerState, GardenaMowerActivity, GardenaMowerErrorCode } from './Enums';

enum GardenaMowerCommand {
  Start = 'START_SECONDS_TO_OVERRIDE',
  ResumeSchedule = 'START_DONT_OVERRIDE',
  ParkUntilNextTask = 'PARK_UNTIL_NEXT_TASK',
  ParkUntilFurtherNotice = 'PARK_UNTIL_FURTHER_NOTICE'
}

export class GardenaMower extends GardenaDevice {
  private serviceId: string;
  public state: GardenaMowerState;
  public stateTs: Moment.Moment;
  public activity: GardenaMowerActivity;
  public activityTs: Moment.Moment;
  public lastErrorCode: GardenaMowerErrorCode;
  public lastErrorCodeTs: Moment.Moment;
  public operatingHours: number;

  public constructor(connection: GardenaConnection, id: string, serviceId: string, attributes: GardenaRawDeviceAttributeJson[]) {
    super(connection, id);

    this.serviceId = serviceId;
    this.processAttributes(attributes);
  }

  public async parkUntilFurtherNotice(): Promise<void> {
    await this.command(GardenaMowerCommand.ParkUntilFurtherNotice);
  }

  public async parkUntilNextTask(): Promise<void> {
    await this.command(GardenaMowerCommand.ParkUntilNextTask);
  }

  public async resumeSchedule(): Promise<void> {
    await this.command(GardenaMowerCommand.ResumeSchedule);
  }

  public async startMowing(minutes?: number): Promise<void> {
    await this.command(GardenaMowerCommand.Start, minutes);
  }

  private async command(command: GardenaMowerCommand, minutes?: number): Promise<void> {
    try {
      const body: any = {
        data: {
          id: crypto.randomUUID(),
          type: 'MOWER_CONTROL',
          attributes: {
            command: command
          }
        }
      };

      // Add seconds to body if minutes provided
      if (minutes) {
        body.data.attributes.seconds = minutes * 60;
      }

      // Request
      const res = await this.connection.apiRequest(`${API_BASE}/command/${this.serviceId}`, null, 'PUT', body);

      console.log(res);
    } catch (e) {
      throw new GardenaApiError(`Couldn't execute MOWER_CONTROL command`);
    }
  }

  public get error(): GardenaMowerErrorCode {
    // If currently in warning/error state, return the latest known error
    if ((this.state == GardenaMowerState.Error || this.state == GardenaMowerState.Warning) && this.error) {
      return this.error;
    }

    return null;
  }
}
