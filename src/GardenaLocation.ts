import Moment from 'moment';
import crypto from 'crypto';
import WebSocket, { RawData } from 'ws';
import { API_BASE } from './config.js';
import { GardenaApiError, GardenaConnection } from './GardenaConnection.js';
import { GardenaDevice, GardenaRawDeviceAttributeJson, GardenaRawDevicesJson } from './GardenaDevice.js';
import { GardenaMower } from './GardenaMower.js';

export class GardenaLocationError extends Error {}

export type GardenaRawLocationsJson = {
  data: GardenaRawLocationJson[];
};

export type GardenaRawLocationJson = {
  id: string;
  type: string;
  attributes: {
    name: string;
  };
};

const PING_INTERVAL = 150000; // 150 seconds

export class GardenaLocation {
  private connection: GardenaConnection;
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public devices: GardenaDevice[];
  private ws: WebSocket;
  private wsPingInterval: NodeJS.Timeout;
  private wsPongTimeout: NodeJS.Timeout;
  private keepWsAlive: boolean;

  public constructor(connection: GardenaConnection, json: GardenaRawLocationJson) {
    this.connection = connection;
    this.id = json.id;
    this.name = json.attributes.name;
    this.type = json.type;
  }

  public async getDevices(): Promise<GardenaDevice[]> {
    if (!this.devices) {
      await this.updateDevicesList();
    }
    return this.devices;
  }

  public async updateDevicesList(): Promise<void> {
    const supportedDeviceTypes = ['MOWER'];

    // Get devices
    const devices: GardenaDevice[] = [];
    try {
      const res = (await this.connection.apiRequest(`${API_BASE}/locations/${this.id}`)) as GardenaRawDevicesJson;

      if (res.data.relationships.devices.data && res.included) {
        // Get list of device IDs
        const deviceIds: string[] = [];
        for (const device of res.data.relationships.devices.data) {
          deviceIds.push(device.id);
        }

        // Get all characteristics for each device
        for (const deviceId of deviceIds) {
          // Get all characteristics which are linked to the device ID
          const rawCharacteristics = res.included.filter((x) => {
            return (
              (x.id == deviceId && x.relationships && x.relationships.services && x.relationships.services.data) ||
              (x.relationships && x.relationships.device && x.relationships.device.data.id == deviceId)
            );
          });

          // Get device type & service ID
          const characteristicWithType = rawCharacteristics.find((x) => {
            return (
              supportedDeviceTypes.find((y) => {
                return y == x.type;
              }) !== undefined
            );
          });
          const type = characteristicWithType.type;
          const serviceId = characteristicWithType.id;

          // Only proceed when a supported device is found
          const attributes: GardenaRawDeviceAttributeJson[] = [];
          if (type) {
            // Check all characteristics
            for (const c of rawCharacteristics) {
              // Get attributes
              if (c.attributes) {
                for (const [attrName, attrVal] of Object.entries(c.attributes) as any) {
                  attributes[attrName] = {
                    value: attrVal.value
                  };

                  // Add timestamp if provided
                  if (attrVal.timestamp) {
                    attributes[attrName].ts = Moment(attrVal.timestamp);
                  }
                }
              }
            }
          }

          // Parse device
          let device: GardenaDevice;
          switch (type) {
            case 'MOWER':
              device = new GardenaMower(this.connection, deviceId, serviceId, attributes);
              break;
            default:
              continue;
          }

          // Add device to list
          devices.push(device);
        }
      } else {
        throw new GardenaApiError(`No devices status retrieved for location ${this.id}`);
      }
    } catch (e) {
      throw new GardenaApiError('Failed to get locations from Gardena API', { cause: e });
    }

    this.devices = devices;
  }

  private onWSOpen(): void {
    // Emit 'startWSUpdates' event on each device when websocket is opened
    for (const device of this.devices) {
      device.emit('startWSUpdates');
    }

    // Send regular heartbeat to keep the connection open
    this.wsPingInterval = setInterval(() => {
      // Expect pong
      this.wsPongTimeout = setTimeout(() => {
        // Didn't recieve a timely pong from the server. So assuming the connection is dead and needs to be reopened
        this.resetWS();
      }, 1000);

      // Send ping
      this.ws.ping((err) => {
        if (err) {
          this.resetWS();
        }
      });
    }, PING_INTERVAL);
  }

  private onWSPong(): void {
    clearTimeout(this.wsPongTimeout);
  }

  private onWSError(): void {
    this.resetWS();
  }

  private onWSMessage(data: RawData): void {
    // Parse JSON
    let json: any;
    try {
      json = JSON.parse(data.toString());
    } catch (e) {
      throw new GardenaApiError(`Received websocket message, but couldn't decode as JSON: ${data.toString()}`);
    }

    // Check if linked to device
    // First by checking the id of the message
    let matchedDevice = this.devices.find((x) => {
      return x.ids.includes(json.id);
    });
    // Then by checking the id of the mentioned relationship
    if (!matchedDevice && json.relationships && json.relationships.device && json.relationships.device.data.id) {
      matchedDevice = this.devices.find((x) => {
        return x.id == json.relationships.device.data.id;
      });
    }

    if (matchedDevice) {
      // List attributes
      if (json.attributes) {
        const attributes: GardenaRawDeviceAttributeJson[] = [];
        for (const [attrName, attrVal] of Object.entries(json.attributes) as any) {
          attributes[attrName] = {
            value: attrVal.value
          };

          // Add timestamp if provided
          if (attrVal.timestamp) {
            attributes[attrName].ts = Moment(attrVal.timestamp);
          }
        }

        // Update attributes on device
        const updateList = matchedDevice.processAttributes(attributes);

        // Emit event with attributes
        matchedDevice.emit('wsUpdate', updateList);
      }
    }
  }

  private async onWSClose(): Promise<void> {
    this.resetWS();
  }

  private async resetWS(): Promise<void> {
    // Terminate ws
    this.closeWS(true);

    // Emit 'stopWSUpdates' event on each device when websocket is closed
    for (const device of this.devices) {
      device.emit('stopWSUpdates');
    }

    // Wait 10 sec
    await new Promise((r) => setTimeout(r, 10000));

    // Reinitiate websocket
    if (this.keepWsAlive) {
      await this.updateDevicesList();
      await this.activateRealtimeUpdates();
    }
  }

  private closeWS(immediatly = false): void {
    if (this.ws) {
      try {
        // Close
        if (immediatly) {
          this.ws.terminate();
        } else {
          this.ws.close();
        }

        // Clear timers
        clearInterval(this.wsPingInterval);
        clearTimeout(this.wsPongTimeout);

        // Remove event listeners
        this.ws.removeAllListeners();

        // Unset WS
        this.ws = undefined;
      } catch (e) {}
    }
  }

  public async activateRealtimeUpdates(): Promise<void> {
    this.keepWsAlive = true;

    // Destroy the already active websocket
    if (this.ws) {
      this.closeWS(true);
    }

    // Get initial list of devices if not already done
    if (!this.devices) {
      await this.updateDevicesList();
    }

    // Create request body
    const body = {
      data: {
        id: crypto.randomUUID(),
        type: 'WEBSOCKET',
        attributes: {
          locationId: this.id
        }
      }
    };

    // Request Websocket URL
    let websocketUrl: string;
    try {
      const res = (await this.connection.apiRequest(`${API_BASE}/websocket`, null, 'POST', body, 201)) as any;
      websocketUrl = res.data.attributes.url;
    } catch (e) {
      throw new GardenaApiError(`Couldn't retrieve websocket URL from Gardena API`, { cause: e });
    }

    // Setup websocket
    try {
      this.ws = new WebSocket(websocketUrl);
    } catch (e) {
      throw new GardenaApiError(`Couldn't setup websocket with Gardena API`);
    }

    // Subscribe to events if websocket was succesfully created
    if (this.ws) {
      this.ws.on('open', () => {
        this.onWSOpen();
      });
      this.ws.on('pong', () => {
        this.onWSPong();
      });
      this.ws.on('message', (msg) => {
        this.onWSMessage(msg);
      });
      this.ws.on('close', () => {
        this.onWSClose();
      });
      this.ws.on('error', () => {
        this.onWSError();
      });
    }
  }

  public async deactivateRealtimeUpdates(): Promise<void> {
    this.keepWsAlive = false;
    this.closeWS();
  }
}
