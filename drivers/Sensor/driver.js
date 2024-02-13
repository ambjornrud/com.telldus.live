'use strict';

const Homey = require('homey');
const constantsDriver = require('../../lib/constants');
const constantsTelldus = require('../../lib/telldus-api/constants');

module.exports = class SensorDriver extends Homey.Driver {

    async onPairListDevices() {
        try {
            const apis = this.homey.app.getApi();
            let devices = [];

            for (let api of apis) {
                const telldusClientId = api.clientId;
                const online = true;
                const telldusSensors = await api.api.listSensors({
                    telldusClientId: api.driverId === constantsDriver.DRIVER_CLIENT_LIVE ? telldusClientId : undefined,
                    online
                });

                for (let telldusSensor of telldusSensors) {
                    let capabilities = [];
                    if (telldusSensor.data && telldusSensor.data.length > 0) {
                        for (let val of telldusSensor.data) {
                            if (val.name === 'temp') {
                                capabilities.push('measure_temperature');
                                //scale 0
                            } else if (val.name === 'humidity') {
                                capabilities.push('measure_humidity');
                                //scale 0
                            } else if (val.name === 'watt') {
                                if (val.unit === 'kWh' || val.scale == 0) {   //Røykvarsler 2 serverrom kjeller (var gjesterom)
                                    capabilities.push('meter_power');
                                // } else if (val.unit === 'kvAh' || val.scale == 1) { // Akk Power kVAh
                                //     capabilities.push('??'); // Finnes ikke på Homey!
                                } else if (val.unit === 'W' || val.scale == 2) {
                                    capabilities.push('measure_power');
                                // } else if (val.unit === '' || val.scale == 3) { // Pulse
                                //     capabilities.push('??'); // Finnes ikke på Homey!
                                } else if (val.unit === 'V' || val.scale == 4) {
                                    capabilities.push('measure_voltage');
                                } else if (val.unit === 'A' || val.scale == 5) {
                                    capabilities.push('measure_current');
                                // } else if (val.unit === '' || val.scale == 6) { // Power Factor
                                //     capabilities.push('??'); // Finnes ikke på Homey!
                                }
                            } else if (val.name === 'rtot') {   //Værstasjon regn
                                capabilities.push('meter_rain');
                                // scale: 0 unit: "mm" - meter_rain er i m3 ??!?
                            } else if (val.name === 'rrate') {   //Værstasjon regn
                                capabilities.push('measure_rain');
                                // scale: 0 unit: "mm/h" - measure_rain er i mm ??!?
                            } else if (val.name === 'wdir') {   //Værstasjon vind
                                capabilities.push('measure_wind_angle');
                                // scale: 0 unit: ""
                            } else if (val.name === 'wavg') {   //Værstasjon vind
                                capabilities.push('measure_wind_strength');
                                // scale: 0 unit: "m/s" -> km/h!
                            } else if (val.name === 'wgust') {   //Værstasjon vind
                                capabilities.push('measure_gust_strength');
                                // scale: 0 unit: "m/s" -> km/h!
                            }
                        }
                    }
                    if (telldusSensor.battery) {
                        let batteryValue = parseFloat(telldusSensor.battery);
                        if (batteryValue == constantsTelldus.BATTERY_STATUS.ok || batteryValue == constantsTelldus.BATTERY_STATUS.low) {
                            capabilities.push('alarm_battery');
                        } else if (batteryValue >= 0 && batteryValue <= 100) {
                            capabilities.push('measure_battery');
                        }
                    }
                    if (capabilities.length > 0) {
                        this.log(`${telldusSensor.name}${api.shortName ? ' (' + api.shortName + ')' : ''}`);
                        this.log("telldusSensor.id: " + telldusSensor.id);
                        this.log("telldusClientId: " + telldusClientId);
                        devices.push({
                            "name": `${telldusSensor.name}${api.shortName ? ' (' + api.shortName + ')' : ''}`,
                            "data": {
                                "id": telldusSensor.id,
                                "clientId": telldusClientId
                            },
                            "capabilities": capabilities
                        });
                    }
                }
            }

            return devices;

        } catch (err) {
            this.log('onPairListDevices error', err);
            throw new Error("Failed to retrieve sensors.");
        }
    }

};
