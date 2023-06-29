# Gardena

[![npm](https://badgen.net/npm/v/gardena-smart-system)](https://www.npmjs.com/package/gardena-smart-system)

A nodejs package which allows communicating with the Gardena smart system API.
Currently only supports mowers, but can easily be expanded to support others.

## Install

`npm i --save gardena-smart-system`

## Basic static example
Get a list of all devices including a snapshot of their state.
Note: Make sure you don't do this too often because these calls are rate limited.

```javascript
import GardenaConnection from 'gardena-smart-system';

const gardena = new GardenaConnection({ clientId: 'YOUR_APP_KEY', clientSecret:'YOUR_APP_SECRET' });
const devices = await gardena.getDevices();
```

## Realtime status of devices
```javascript
import GardenaConnection from 'gardena-smart-system';

const gardena = new GardenaConnection({ clientId: 'YOUR_APP_KEY', clientSecret:'YOUR_APP_SECRET' });
const devices = await gardena.getDevices();
const mower = devices[0];

mower.onStartRealtimeUpdates(()=> {
    console.log(`Websocket opened listening for updates for this device.`);
});

mower.onUpdate((updatedFields)=> {
    console.log(`Received updates for these fields on this device: ${updatedFields}`);
});

await gardena.activateRealtimeUpdates();
```

## Commanding a device
```javascript
import GardenaConnection from 'gardena-smart-system';

const gardena = new GardenaConnection({ clientId: 'YOUR_APP_KEY', clientSecret:'YOUR_APP_SECRET' });
const devices = await gardena.getDevices();
const mower = devices[0];

await mower.resumeSchedule();
await mower.parkUntilFurtherNotice();
await mower.parkUntilNextTask();
await mower.startMowing(60); // 60 minutes
```