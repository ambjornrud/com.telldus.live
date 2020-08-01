'use strict';

const Homey = require('homey');
const { LiveApi } = require('../../lib/telldus-api/index');
const BaseClientDevice = require('../../lib/BaseClientDevice');
const constants = require('../../lib/telldus-api/constants');

module.exports = class ClientDevice extends BaseClientDevice {

    onInit() {
        const keys = this.getStoreValue('keys');
        const log = this.log;
        this._api = new LiveApi(keys, { log });
        this.scheduleCheckData(5);
    }

    async fetchClientState() {
        const clients = await this._api.listClients();
        const client = clients && clients.client ? clients.client.find(client => client.id === this.getId()) : undefined;
        if (client) {
            const online = client.online === '1';
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
    }

    async fetchSensorValues() {
        const sensors = await this._api.listSensors({
            telldusClientId: this.getId()
        });
        Homey.app.sensorValues(sensors);
    }

    async fetchDevicesValues() {
        const devices = await this._api.listDevices({
            telldusClientId: this.getId(),
            filterDeviceType: constants.DEVICE_TYPES.switch
        })
        Homey.app.deviceValues(devices);
    }

};
