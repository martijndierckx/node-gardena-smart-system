import { GardenaConnection } from './GardenaConnection.js';
export default GardenaConnection;

export type * from './GardenaAccessToken';
export type * from './GardenaAuth';
export type * from './GardenaDevice';
export type * from './GardenaLocation';
export type * from './GardenaMower';

export * from './Enums.js';

export { GardenaWrongCredentialsError, GardenaAuthError } from './GardenaAuth.js';
export { GardenaApiError } from './GardenaConnection.js';
export { GardenaLocationError } from './GardenaLocation.js'
