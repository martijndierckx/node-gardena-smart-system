import fetch from 'node-fetch';
import { API_BASE } from './config';
import { GardenaAuth } from './GardenaAuth';
import { GardenaLocation, GardenaLocationError, GardenaRawLocationsJson } from './GardenaLocation';
import { GardenaDevice } from './GardenaDevice';

export type GardenaConnectionConfig = {
  clientId: string;
  clientSecret: string;
};

export class GardenaApiError extends Error {}

export class GardenaConnection {
  private auth: GardenaAuth;
  private locations: GardenaLocation[];

  public constructor(config: GardenaConnectionConfig) {
    this.auth = new GardenaAuth({ clientId: config.clientId, clientSecret: config.clientSecret });
  }

  public async activateRealtimeUpdates(location?: GardenaLocation | string): Promise<void> {
    const loc = await this.selectLocation(location);
    return loc.activateRealtimeUpdates();
  }

  public async getLocations(): Promise<GardenaLocation[]> {
    // Reset locations list
    this.locations = [];

    // Get locations
    try {
      const res = (await this.apiRequest(`${API_BASE}/locations`)) as GardenaRawLocationsJson;
      if (res.data) {
        for (const loc of res.data) {
          // Add to cached list of locations
          this.locations.push(new GardenaLocation(this, loc));
        }
      } else {
        throw new GardenaApiError('No locations found');
      }
    } catch (e) {
      throw new GardenaApiError('Failed to get locations from Gardena API');
    }

    // Return locations
    return this.locations;
  }

  public async getDevices(location?: GardenaLocation | string): Promise<GardenaDevice[]> {
    const loc = await this.selectLocation(location);
    return loc.getDevices();
  }

  private async selectLocation(location?: GardenaLocation | string): Promise<GardenaLocation> {
    // Set provided location
    if (location && location instanceof GardenaLocation) {
      return location;
    }

    // Get all Locations
    if (!this.locations) {
      await this.getLocations();
    }

    // Set provided location by id
    if (location && typeof location === 'string') {
      const match = this.locations.find((x) => {
        return x.id == location;
      });
      if (match) {
        return match;
      } else {
        throw new GardenaLocationError(`Couldn't find a matching location for id ${location}`);
      }
    }

    // Multiple locations?
    if (this.locations.length > 1) {
      throw new GardenaLocationError('Multiple locations available on this Gardena account. Please provide a specific location.');
    }

    // Return first location
    return this.locations[0];
  }

  public async apiRequest(url: string | URL, headers?: any, method = 'GET', body?: any) {
    try {
      // Add header when json body object is provided
      let bodyHeader = null;
      if(body && typeof body === 'object') {
        bodyHeader = { 'Content-Type': 'application/vnd.api+json' };
        body = JSON.stringify(body);
      }

      // Combine Auth headers with provided ones
      const combinedHeaders = {
        ...bodyHeader,
        ...headers,
        ...{
          Authorization: `Bearer ${await this.auth.getValidAccessToken()}`,
          'X-Api-Key': this.auth.clientId
        }
      };

      // Request with authorization headers
      const res = await fetch(url, {
        method,
        body,
        headers: combinedHeaders
      });

      // Return JSON
      return await res.json();
    } catch (e) {
      throw new GardenaApiError(`Failed to get response from ${method} on ${url.toString()} on the Gardena API`);
    }
  }
}
