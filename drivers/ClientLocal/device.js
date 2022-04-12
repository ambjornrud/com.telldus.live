'use strict';

const Homey = require('homey');
const { LocalApi } = require('../../lib/telldus-api/index');
const BaseClientDevice = require('../../lib/BaseClientDevice');
const constants = require('../../lib/telldus-api/constants');

module.exports = class ClientLocalDevice extends BaseClientDevice {

    onInit() {
      const keys = this.getStoreValue('keys');
      const host = keys.ip_address;
      const accessToken = keys.access_token;
      const log = this.log;
      this._api = new LocalApi({ host, accessToken, log });

      const settings = {
        Auth_Token: accessToken,
        Host: host
      };
      const promise = this.setSettings(settings);
      this.scheduleCheckData(5);
    }

    getShortName() {
        return 'local';
    }

    async fetchClientState() {
        let online;
        try {
            const systemInfo = await this._api.systemInfo();
            online = true;
        } catch (err) {
            online = false;
        }
        if (online !== this.getCapabilityValue('online')) {
            this.setCapabilityValue('online', online).catch(err => this.log('error setting online capability', err));
            if (online) {
                Homey.app.triggerClientOnline.trigger(this, {
                    clientId: this.getId(),
                    clientName: this.getName(),
                }, null);
            } else {
                Homey.app.triggerClientOffline.trigger(this, {
                    clientId: this.getId(),
                    clientName: this.getName(),
                }, null);
            }
        }

    }

    async fetchSensorValues() {
        const sensors = await this._api.listSensors({});
        this.log("sensors: " + JSON.stringify(sensors, null, 2));
        Homey.app.sensorValues(sensors);
    }

    async fetchDevicesValues() {
        const devices = await this._api.listDevices({});
//    this.log("devices: " + JSON.stringify(devices, null, 2));
        Homey.app.deviceValues(devices);
    }

};
