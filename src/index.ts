import { GardenaConnection } from './GardenaConnection.js';
export default GardenaConnection;

export type * from './GardenaAccessToken';
export type * from './GardenaAuth';

export * from './GardenaDevice.js';
export * from './GardenaLocation.js';
export * from './GardenaMower.js';

export * from './Enums.js';

export { GardenaWrongCredentialsError, GardenaAuthError } from './GardenaAuth.js';
export { GardenaApiError } from './GardenaConnection.js';
//export { GardenaLocationError } from './GardenaLocation.js'
