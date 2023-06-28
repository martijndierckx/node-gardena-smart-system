import { GardenaApiError, GardenaConnection } from './GardenaConnection';
import { GardenaDevice, GardenaRawDeviceAttributeJson, GardenaRawDevicesJson } from './GardenaDevice';
import { GardenaMower } from './GardenaMower';
import Moment from 'moment';
import crypto from 'crypto';
import { API_BASE } from './config';
import WebSocket from 'ws';

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

          // Get device type
          const characteristicWithType = rawCharacteristics.find((x) => {
            return (
              supportedDeviceTypes.find((y) => {
                return y == x.type;
              }) !== undefined
            );
          });
          const type = characteristicWithType.type;

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
              device = new GardenaMower(deviceId, attributes);
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
      throw new GardenaApiError('Failed to get locations from Gardena API');
    }

    this.devices = devices;
  }

  public async activateRealtimeUpdates(): Promise<void> {
    // Get initial list of devices if not already done
    if (!this.devices) {
      await this.updateDevicesList();
    }

    // Create request body
    const body = JSON.stringify({
      data: {
        id: crypto.randomUUID(),
        type: 'WEBSOCKET',
        attributes: {
          locationId: this.id
        }
      }
    });

    // Request Websocket URL
    let websocketUrl: string;
    try {
      const res = (await this.connection.apiRequest(`${API_BASE}/websocket`, { 'Content-Type': 'application/vnd.api+json' }, 'POST', body)) as any;
      websocketUrl = res.data.attributes.url;
    } catch (e) {
      throw new GardenaApiError(`Couldn't retrieve websocket URL from Gardena API`);
    }

    // Setup websocket
    let ws: WebSocket;
    try {
      ws = new WebSocket(websocketUrl);
    } catch (e) {
      throw new GardenaApiError(`Couldn't setup websocket with Gardena API`);
    }

    // Subscribe to events if websocket was succesfully created
    if (ws) {
      let pingInterval: NodeJS.Timer;

      ws.on('open', () => {
        // Emit 'startWSUpdates' event on each device when websocket is opened
        for (const device of this.devices) {
          device.emit('startWSUpdates');
        }

        // Send regular heartbeat to keep the connection open
        pingInterval = setInterval(() => {
          ws.ping();
        }, 150000); // 150 seconds
      });

      ws.on('close', async () => {
        clearInterval(pingInterval);

        // Reinitiate websocket
        await this.updateDevicesList();
        await this.activateRealtimeUpdates();
      });

      ws.on('message', (data) => {
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
          return x.id == json.id;
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
    }
  }
}
