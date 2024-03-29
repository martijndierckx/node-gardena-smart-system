import Moment from 'moment';
import crypto from 'crypto';
import WebSocket from 'ws';
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

export class GardenaLocation {
  private connection: GardenaConnection;
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public devices: GardenaDevice[];
  private ws: WebSocket;
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

  public async activateRealtimeUpdates(): Promise<void> {
    this.keepWsAlive = true;

    // Destroy the already active websocket
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (e) {}
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
      let pingInterval: NodeJS.Timer;

      this.ws.on('open', () => {
        // Emit 'startWSUpdates' event on each device when websocket is opened
        for (const device of this.devices) {
          device.emit('startWSUpdates');
        }

        // Send regular heartbeat to keep the connection open
        pingInterval = setInterval(() => {
          this.ws.ping((err) => {
            if (err) {
              // Didn't recieve a timely pong from the server. So assuming the connection is dead and needs to be reopened
              this.ws.terminate();
              checkClose();
            }
          });
        }, 150000); // 150 seconds
      });

      this.ws.on('message', (data) => {
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
      });

      const checkClose = async () => {
        clearInterval(pingInterval);

        // Emit 'stopWSUpdates' event on each device when websocket is closed
        for (const device of this.devices) {
          device.emit('stopWSUpdates');
        }

        // Reinitiate websocket
        if (this.keepWsAlive) {
          await this.updateDevicesList();
          await this.activateRealtimeUpdates();
        }
      };

      this.ws.on('close', checkClose);
    }
  }

  public async deactivateRealtimeUpdates(): Promise<void> {
    this.keepWsAlive = false;
    this.ws.close();
  }
}
