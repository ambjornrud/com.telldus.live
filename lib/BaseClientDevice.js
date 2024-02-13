'use strict';

const Homey = require('homey');

module.exports = class BaseClientDevice extends Homey.Device {

    onDeleted() {
        this._deleted = true;
        this.clearCheckData();
    }

    getId() {
        return this.getData().id;
    }

    getUuid() {
        return this.getData().uuid;
    }

    getApi() {
        return this._api;
    }

    getShortName() {
        return undefined;
    }

    async onSettings({oldSettings, newSettings, changedKeys}) {
        if (changedKeys.includes('Polling_Interval')) {
            this.scheduleCheckData(newSettings.Polling_Interval);
        }
    }

    async checkData() {
        if (this._deleted) {
            return;
        }
        try {
            this.clearCheckData();
            await this.fetchClientState();
            await this.sleep(10000);
            // ikke gi opp selv om sensor eller device feiler. Merk at clientState må sjekkes OK først, hvis kula er nede er det ikke noe vits i å sjekke sensorer og devices
// to tråder?
            await this.fetchDevicesValues();
            await this.sleep(10000);
            await this.fetchSensorValues();
        } catch (err) {
            this.log('checkData error', err);
        } finally {
            this.scheduleCheckData();
        }
    }

    // Define a sleep function that returns a promise
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    clearCheckData() {
        if (this.curTimeout) {
            this.homey.clearTimeout(this.curTimeout);
            this.curTimeout = undefined;
        }
    }

    async scheduleCheckData(seconds) {
        if (this._deleted) {
            return;
        }
        this.clearCheckData();
        let interval = seconds;
        if (!interval) {
            let settings = await this.getSettings();
            interval = settings.Polling_Interval || 30;
        }
        this.curTimeout = this.homey.setTimeout(this.checkData.bind(this), interval * 1000);
    }

};