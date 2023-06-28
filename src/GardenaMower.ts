import Moment from 'moment';
import crypto from 'crypto';
import { API_BASE } from './config';
import { GardenaDevice, GardenaRawDeviceAttributeJson } from './GardenaDevice';
import { GardenaConnection } from './GardenaConnection';
import { GardenaApiError } from './GardenaConnection';

export enum GardenaMowerState {
  Ok = 'OK',
  Warning = 'WARNING',
  Error = 'ERROR',
  Unavailable = 'UNAVAILABLE'
}

export enum GardenaMowerActivity {
  Paused = 'PAUSED',
  Cutting = 'OK_CUTTING',
  CuttingManual = 'OK_CUTTING_TIMER_OVERRIDDEN',
  Searching = 'OK_SEARCHING',
  Leaving = 'OK_LEAVING',
  Charging = 'OK_CHARGING',
  Parked = 'PARKED_TIMER',
  ParkedManual = 'PARKED_PARK_SELECTED',
  ParkedInsufficientGrassHeight = 'PARKED_AUTOTIMER',
  None = 'NONE'
}

export enum GardenaMowerErrorCode {
  NoMessage = 'NO_MESSAGE',
  OutsideWorkingArea = 'OUTSIDE_WORKING_AREA',
  NoLoopSignal = 'NO_LOOP_SIGNAL',
  WrongLoopSignal = 'WRONG_LOOP_SIGNAL',
  LoopSensorProblemFront = 'LOOP_SENSOR_PROBLEM_FRONT',
  LoopSensorProblemRear = 'LOOP_SENSOR_PROBLEM_REAR',
  LoopSensorProblemLeft = 'LOOP_SENSOR_PROBLEM_LEFT',
  LoopSensorProblemRight = 'LOOP_SENSOR_PROBLEM_RIGHT',
  WrongPinCode = 'WRONG_PIN_CODE',
  Trapped = 'TRAPPED',
  UpsideDown = 'UPSIDE_DOWN',
  EmptyBatter = 'EMPTY_BATTERY',
  NoDrive = 'NO_DRIVE',
  TemporarilyLifted = 'TEMPORARILY_LIFTED',
  Lifted = 'LIFTED',
  StuckInChargingStation = 'STUCK_IN_CHARGING_STATION',
  ChargingStationBlocked = 'CHARGING_STATION_BLOCKED',
  CollisionSensorProblemRear = 'COLLISION_SENSOR_PROBLEM_REAR',
  CollisionSensorProblemFront = 'COLLISION_SENSOR_PROBLEM_FRONT',
  WheelMotorBlockedRight = 'WHEEL_MOTOR_BLOCKED_RIGHT',
  WheelMotorBlockedLeft = 'WHEEL_MOTOR_BLOCKED_LEFT',
  WheelDriveProblemRight = 'WHEEL_DRIVE_PROBLEM_RIGHT',
  WheelDriveProblemLeft = 'WHEEL_DRIVE_PROBLEM_LEFT',
  CuttingMotorDriveDefect = 'CUTTING_MOTOR_DRIVE_DEFECT',
  CuttingSystemBlocked = 'CUTTING_SYSTEM_BLOCKED',
  InvalidSubDeviceCombination = 'INVALID_SUB_DEVICE_COMBINATION',
  MemoryCircuitProblem = 'MEMORY_CIRCUIT_PROBLEM',
  ChargingSystemProblem = 'CHARGING_SYSTEM_PROBLEM',
  StopButtonProblem = 'STOP_BUTTON_PROBLEM',
  TitleSensorProblem = 'TILT_SENSOR_PROBLEM',
  Tilted = 'MOWER_TILTED',
  WheelMotorOverloadedRight = 'WHEEL_MOTOR_OVERLOADED_RIGHT',
  WheelMotorOverloadedLeft = 'WHEEL_MOTOR_OVERLOADED_LEFT',
  ChargingCurrentTooHigh = 'CHARGING_CURRENT_TOO_HIGH',
  ElectricProblem = 'ELECTRONIC_PROBLEM',
  CuttingMotorProblem = 'CUTTING_MOTOR_PROBLEM',
  LimitedCuttingHeightRange = 'LIMITED_CUTTING_HEIGHT_RANGE',
  CuttingHeightProblemDrive = 'CUTTING_HEIGHT_PROBLEM_DRIVE',
  CuttingHeightProblemCurrent = 'CUTTING_HEIGHT_PROBLEM_CURR',
  CuttingHeightProblemData = 'CUTTING_HEIGHT_PROBLEM_DIR',
  CuttingHeightBlocked = 'CUTTING_HEIGHT_BLOCKED',
  CuttingHeightProblem = 'CUTTING_HEIGHT_PROBLEM',
  BatteryProblem = 'BATTERY_PROBLEM',
  TooManyBatteries = 'TOO_MANY_BATTERIES',
  AlarmMowerSwitchedOff = 'ALARM_MOWER_SWITCHED_OFF',
  AlarmMowerStopped = 'ALARM_MOWER_STOPPED',
  AlarmMowerLifted = 'ALARM_MOWER_LIFTED',
  AlarmMowerTilted = 'ALARM_MOWER_TILTED',
  AlarmMowerInMotion = 'ALARM_MOWER_IN_MOTION',
  AlarmOutsideGeofence = 'ALARM_OUTSIDE_GEOFENCE',
  Slipped = 'SLIPPED',
  InvalidBatteryCombination = 'INVALID_BATTERY_COMBINATION',
  Uninitialised = 'UNINITIALISED',
  WaitUpdating = 'WAIT_UPDATING',
  WaitPowerUp = 'WAIT_POWER_UP',
  OffDisabled = 'OFF_DISABLED',
  OffHatchOpen = 'OFF_HATCH_OPEN',
  OffHatchClosed = 'OFF_HATCH_CLOSED',
  ParkedDailyLimitReached = 'PARKED_DAILY_LIMIT_REACHED'
}

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
      if(minutes) {
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
